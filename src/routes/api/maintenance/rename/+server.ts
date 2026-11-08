import { json, type RequestHandler } from '@sveltejs/kit';

import { planReadableNames } from '$lib/server/documentNames';
import { readData, renameStoredFile, saveData } from '$lib/server/storage';
import { driveEnabled, driveListDocumentDetails } from '$lib/server/googleDrive';
import type { AppData } from '$lib/types';

/**
 * Re-links documents whose stored name no longer exists on the Drive (names drifted after an
 * interrupted rename) to the unreferenced Drive file with the same size, created at upload time.
 */
async function relinkDrifted(data: AppData) {
	if (!driveEnabled()) return 0;
	const files = await driveListDocumentDetails();
	const existing = new Set(files.map((file) => file.stored.normalize('NFC')));
	const referenced = new Set(
		[
			...data.documents.map((d) => d.storedName),
			...data.periods.map((p) => p.sourceStoredName),
			...data.royalties.map((r) => r.storedName),
			...(data.congesPayments ?? []).map((c) => c.storedName)
		]
			.filter(Boolean)
			.map((name) => name.normalize('NFC'))
	);
	const free = files.filter((file) => !referenced.has(file.stored.normalize('NFC')));
	const fixes = new Map<string, string>();
	for (const document of data.documents) {
		const name = document.storedName;
		if (!name || existing.has(name.normalize('NFC')) || fixes.has(name)) continue;
		const uploaded = Date.parse(document.uploadedAt);
		const match = free
			.filter((file) => file.size === document.size)
			.map((file) => ({ file, gap: Math.abs(Date.parse(file.createdTime) - uploaded) }))
			.filter(({ gap }) => Number.isFinite(gap) && gap < 120_000)
			.sort((a, b) => a.gap - b.gap)[0];
		if (!match) continue;
		fixes.set(name, match.file.stored);
		free.splice(free.indexOf(match.file), 1);
	}
	const fix = (name: string) => fixes.get(name) ?? name;
	data.documents.forEach((d) => (d.storedName = fix(d.storedName)));
	data.periods.forEach((p) => (p.sourceStoredName = fix(p.sourceStoredName)));
	data.royalties.forEach((r) => (r.storedName = fix(r.storedName)));
	(data.congesPayments ?? []).forEach((c) => (c.storedName = fix(c.storedName)));
	return fixes.size;
}

/** Gives every stored copy a readable name (AAAAMM_Type_employeur_projet.pdf). */
export const POST: RequestHandler = async () => {
	const data = await readData();
	const relinked = await relinkDrifted(data);
	const before = structuredClone(data);
	const plans = planReadableNames(data);

	const failed = new Set<string>();
	for (const plan of plans) {
		if (!(await renameStoredFile(plan.from, plan.to))) failed.add(plan.from);
	}

	// Keep the old name for any file that could not be renamed.
	if (failed.size) {
		const restore = (current: string, original: string) =>
			failed.has(original) ? original : current;
		data.documents.forEach((item, index) => {
			item.storedName = restore(item.storedName, before.documents[index].storedName);
		});
		data.periods.forEach((item, index) => {
			item.sourceStoredName = restore(item.sourceStoredName, before.periods[index].sourceStoredName);
		});
		data.royalties.forEach((item, index) => {
			item.storedName = restore(item.storedName, before.royalties[index].storedName);
		});
		data.congesPayments.forEach((item, index) => {
			item.storedName = restore(item.storedName, before.congesPayments[index].storedName);
		});
	}

	const saved = await saveData(data);
	return json({ data: saved, relinked, renamed: plans.length - failed.size, failed: [...failed] });
};

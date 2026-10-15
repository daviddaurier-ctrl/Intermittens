import { json, type RequestHandler } from '@sveltejs/kit';

import { planReadableNames } from '$lib/server/documentNames';
import { readData, renameStoredFile, saveData } from '$lib/server/storage';

/** Gives every stored copy a readable name (AAAAMM_Type_employeur_projet.pdf). */
export const POST: RequestHandler = async () => {
	const data = await readData();
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
	}

	const saved = await saveData(data);
	return json({ data: saved, renamed: plans.length - failed.size, failed: [...failed] });
};

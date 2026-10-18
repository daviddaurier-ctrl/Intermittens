import { analyzeAreNotification } from '$lib/server/areAnalysis';
import { extractTextFromBuffer } from '$lib/server/documentAnalysis';
import { mutateData, readData, readStoredFile } from '$lib/server/storage';

/** Marker stored in period.analysisNotes once the daily allowance has been re-read from its notification. */
export const ALLOWANCE_CHECK_MARK = 'AJ relue sur la notification ARE';

/**
 * The daily allowance (AJ) of a period comes from its admission notification only.
 * Older versions overwrote it with the amount printed on France Travail "relevés de situation",
 * which can belong to another period. Re-read the notification once per period and restore it.
 */
export async function restoreAllowancesFromNotifications() {
	const data = await readData();
	const todo = data.periods.filter(
		(period) =>
			period.status === 'Notifie' &&
			(period.sourceStoredName || period.sourceTextPreview) &&
			!period.analysisNotes.includes(ALLOWANCE_CHECK_MARK)
	);
	if (!todo.length) return [];

	const found = new Map<string, number>();
	for (const period of todo) {
		let text = '';
		try {
			if (period.sourceStoredName) {
				const buffer = Buffer.from(await readStoredFile(period.sourceStoredName));
				text = await extractTextFromBuffer(
					period.sourceFileName || period.sourceStoredName,
					'application/pdf',
					buffer
				);
			}
		} catch (cause) {
			console.error(cause);
		}
		if (!text) text = period.sourceTextPreview;
		const parsed = analyzeAreNotification(text, {
			id: period.id,
			fileName: period.sourceFileName,
			storedName: period.sourceStoredName
		});
		found.set(period.id, parsed.dailyAllowance);
	}

	const changes: { periodId: string; from: number; to: number }[] = [];
	await mutateData((current) => {
		for (const period of current.periods) {
			if (!found.has(period.id)) continue;
			const allowance = found.get(period.id) ?? 0;
			if (allowance > 0 && Math.abs(allowance - period.dailyAllowance) > 0.004) {
				changes.push({ periodId: period.id, from: period.dailyAllowance, to: allowance });
				period.dailyAllowance = allowance;
				period.updatedAt = new Date().toISOString();
				if (period.id === current.settings.activePeriodId) {
					current.settings.minDailyAllowance = allowance;
				}
			}
			period.analysisNotes = [...period.analysisNotes, ALLOWANCE_CHECK_MARK];
		}
		return current;
	});
	return changes;
}

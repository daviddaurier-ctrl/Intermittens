import { json, type RequestHandler } from '@sveltejs/kit';

import {
	driveEnabled,
	driveFindFolder,
	driveListImportableFiles,
	driveVisibleFolderNames
} from '$lib/server/googleDrive';
import { restoreAllowancesFromNotifications } from '$lib/server/areRepair';

// Vercel caps request and response bodies at 4.5 MB; keep a margin for the upload step.
const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

export const GET: RequestHandler = async ({ url }) => {
	if (!driveEnabled()) {
		return json({ message: "Google Drive n'est pas relié (page /setup-google)." }, { status: 400 });
	}

	const folderName = (url.searchParams.get('folder') ?? '').trim();
	if (!folderName) return json({ message: 'Nom de dossier manquant.' }, { status: 400 });

	try {
		const folder = await driveFindFolder(folderName);
		if (!folder) {
			const visible = await driveVisibleFolderNames().catch(() => [] as string[]);
			const onlyOwn = visible.every((name) => name === 'InterMittens');
			return json(
				{
					message: onlyOwn
						? `Dossier « ${folderName} » introuvable : l'appli ne voit pas encore vos dossiers. Refaites la liaison sur /setup-google.`
						: `Dossier « ${folderName} » introuvable. Dossiers visibles : ${visible.join(', ')}.`,
					visible
				},
				{ status: 404 }
			);
		}

		await restoreAllowancesFromNotifications().catch((cause) => console.error(cause));
		const all = await driveListImportableFiles(folder.id);
		return json({
			folder: folder.name,
			files: all.filter((file) => !file.size || file.size <= MAX_IMPORT_BYTES),
			tooLarge: all.filter((file) => file.size > MAX_IMPORT_BYTES).map((file) => file.name)
		});
	} catch (cause) {
		console.error(cause);
		const message = cause instanceof Error ? cause.message : 'Lecture du Drive impossible.';
		const needsRelink = /insufficient|403/i.test(message);
		return json(
			{
				message: needsRelink
					? "L'appli n'a pas encore le droit de lire vos dossiers : refaites la liaison sur /setup-google."
					: message
			},
			{ status: 500 }
		);
	}
};

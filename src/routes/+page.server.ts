import { base } from '$app/paths';
import { redirect } from '@sveltejs/kit';

import { driveEnabled, storageRequiresDrive } from '$lib/server/googleDrive';
import { readData } from '$lib/server/storage';
import { pullDataFromRemote } from '$lib/server/remoteSync';

export const load = async ({ fetch, url }) => {
	// Hosted without a disk and Drive not linked yet: go to the linking page first.
	if (storageRequiresDrive() && !driveEnabled()) redirect(303, `${base}/setup-google`);

	const localData = await readData();

	return {
		appData: await pullDataFromRemote(localData, fetch, url)
	};
};

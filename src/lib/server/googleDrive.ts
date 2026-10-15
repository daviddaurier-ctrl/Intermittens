/**
 * Minimal Google Drive client (REST + fetch, no extra dependency).
 *
 * Used when the app runs without a persistent disk (e.g. on Vercel): the JSON data file and
 * the uploaded documents live in an "InterMittens" folder of the owner's Google Drive.
 *
 * Auth: OAuth client + refresh token of the owner, with the `drive.file` scope (the app only
 * sees the files it created itself). Required environment variables:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 * Optional: GOOGLE_DRIVE_FOLDER_NAME (default "InterMittens").
 */
import { env } from '$env/dynamic/private';

// drive.file: files the app creates; drive.readonly: read the owner's existing folders
// (payslips, AEM...) to import them.
export const DRIVE_SCOPE = [
	'https://www.googleapis.com/auth/drive.file',
	'https://www.googleapis.com/auth/drive.readonly'
].join(' ');
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

type DriveFile = { id: string; name: string; mimeType?: string };

let cachedToken: { value: string; expiresAt: number } | undefined;
let cachedRootId: string | undefined;
let cachedDocumentsId: string | undefined;
const fileIdCache = new Map<string, string>();

export function googleOAuthConfigured() {
	return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
}

export function driveEnabled() {
	return googleOAuthConfigured() && Boolean(env.GOOGLE_REFRESH_TOKEN?.trim());
}

export function storageRequiresDrive() {
	return Boolean(env.VERCEL);
}

async function accessToken() {
	if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: env.GOOGLE_CLIENT_ID!.trim(),
			client_secret: env.GOOGLE_CLIENT_SECRET!.trim(),
			refresh_token: env.GOOGLE_REFRESH_TOKEN!.trim(),
			grant_type: 'refresh_token'
		})
	});
	const payload = (await response.json().catch(() => ({}))) as {
		access_token?: string;
		expires_in?: number;
		error?: string;
		error_description?: string;
	};

	if (!response.ok || !payload.access_token) {
		throw new Error(
			`Connexion Google Drive impossible (${payload.error ?? response.status}). ` +
				'Refaites la liaison sur la page /setup-google.'
		);
	}

	cachedToken = {
		value: payload.access_token,
		expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000
	};
	return cachedToken.value;
}

async function driveFetch(url: string, init: RequestInit = {}) {
	const token = await accessToken();
	const headers = new Headers(init.headers);
	headers.set('authorization', `Bearer ${token}`);
	const response = await fetch(url, { ...init, headers });

	if (!response.ok && response.status !== 404) {
		const text = await response.text().catch(() => '');
		throw new Error(`Erreur Google Drive ${response.status}: ${text.slice(0, 300)}`);
	}
	return response;
}

function escapeQuery(value: string) {
	return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findChild(parentId: string, name: string, mimeType?: string) {
	const conditions = [
		`name = '${escapeQuery(name)}'`,
		`'${parentId}' in parents`,
		'trashed = false'
	];
	if (mimeType) conditions.push(`mimeType = '${mimeType}'`);

	const params = new URLSearchParams({
		q: conditions.join(' and '),
		fields: 'files(id,name,mimeType)',
		spaces: 'drive',
		pageSize: '10'
	});
	const response = await driveFetch(`${API}/files?${params}`);
	const payload = (await response.json()) as { files?: DriveFile[] };
	return payload.files?.[0];
}

async function createFolder(name: string, parentId: string) {
	const response = await driveFetch(`${API}/files?fields=id`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] })
	});
	return ((await response.json()) as { id: string }).id;
}

async function ensureFolder(name: string, parentId: string) {
	return (await findChild(parentId, name, FOLDER_MIME))?.id ?? (await createFolder(name, parentId));
}

async function rootFolderId() {
	cachedRootId ??= await ensureFolder(env.GOOGLE_DRIVE_FOLDER_NAME?.trim() || 'InterMittens', 'root');
	return cachedRootId;
}

async function documentsFolderId() {
	cachedDocumentsId ??= await ensureFolder('documents', await rootFolderId());
	return cachedDocumentsId;
}

async function folderFor(area: 'root' | 'documents') {
	return area === 'root' ? rootFolderId() : documentsFolderId();
}

async function fileId(area: 'root' | 'documents', name: string) {
	const key = `${area}/${name}`;
	const cached = fileIdCache.get(key);
	if (cached) return cached;

	const found = await findChild(await folderFor(area), name);
	if (found) fileIdCache.set(key, found.id);
	return found?.id;
}

export async function driveReadFile(area: 'root' | 'documents', name: string) {
	const id = await fileId(area, name);
	if (!id) return undefined;

	const response = await driveFetch(`${API}/files/${id}?alt=media`);
	if (response.status === 404) {
		fileIdCache.delete(`${area}/${name}`);
		return undefined;
	}
	return Buffer.from(await response.arrayBuffer());
}

export async function driveWriteFile(
	area: 'root' | 'documents',
	name: string,
	content: Buffer | Uint8Array | string,
	mimeType = 'application/octet-stream'
) {
	const existingId = await fileId(area, name);
	const boundary = `intermittens_${Math.random().toString(36).slice(2)}`;
	const metadata = existingId ? { name } : { name, parents: [await folderFor(area)] };
	const body = Buffer.concat([
		Buffer.from(
			`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n` +
				`${JSON.stringify(metadata)}\r\n--${boundary}\r\ncontent-type: ${mimeType}\r\n\r\n`
		),
		typeof content === 'string' ? Buffer.from(content, 'utf-8') : Buffer.from(content),
		Buffer.from(`\r\n--${boundary}--`)
	]);
	const url = existingId
		? `${UPLOAD_API}/files/${existingId}?uploadType=multipart&fields=id`
		: `${UPLOAD_API}/files?uploadType=multipart&fields=id`;

	const response = await driveFetch(url, {
		method: existingId ? 'PATCH' : 'POST',
		headers: { 'content-type': `multipart/related; boundary=${boundary}` },
		body
	});
	const { id } = (await response.json()) as { id: string };
	fileIdCache.set(`${area}/${name}`, id);
	return id;
}

export async function driveRenameFile(area: 'root' | 'documents', name: string, newName: string) {
	const id = await fileId(area, name);
	if (!id) return false;

	await driveFetch(`${API}/files/${id}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name: newName })
	});
	fileIdCache.delete(`${area}/${name}`);
	fileIdCache.set(`${area}/${newName}`, id);
	return true;
}

/** Moves a file to the Drive trash (recoverable for 30 days) rather than deleting it outright. */
export async function driveTrashFile(area: 'root' | 'documents', name: string) {
	const id = await fileId(area, name);
	if (!id) return false;

	await driveFetch(`${API}/files/${id}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ trashed: true })
	});
	fileIdCache.delete(`${area}/${name}`);
	return true;
}

export async function driveListFiles(area: 'root' | 'documents') {
	const parentId = await folderFor(area);
	const names: string[] = [];
	let pageToken = '';

	do {
		const params = new URLSearchParams({
			q: `'${parentId}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`,
			fields: 'nextPageToken, files(id,name)',
			spaces: 'drive',
			pageSize: '1000'
		});
		if (pageToken) params.set('pageToken', pageToken);

		const response = await driveFetch(`${API}/files?${params}`);
		const payload = (await response.json()) as { files?: DriveFile[]; nextPageToken?: string };
		for (const file of payload.files ?? []) {
			names.push(file.name);
			fileIdCache.set(`${area}/${file.name}`, file.id);
		}
		pageToken = payload.nextPageToken ?? '';
	} while (pageToken);

	return names;
}

export function googleAuthUrl(redirectUri: string, state: string) {
	const params = new URLSearchParams({
		client_id: env.GOOGLE_CLIENT_ID!.trim(),
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: DRIVE_SCOPE,
		access_type: 'offline',
		prompt: 'consent',
		include_granted_scopes: 'true',
		state
	});
	return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeAuthCode(code: string, redirectUri: string) {
	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: env.GOOGLE_CLIENT_ID!.trim(),
			client_secret: env.GOOGLE_CLIENT_SECRET!.trim(),
			code,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code'
		})
	});
	const payload = (await response.json().catch(() => ({}))) as {
		refresh_token?: string;
		error?: string;
		error_description?: string;
	};

	if (!response.ok || !payload.refresh_token) {
		throw new Error(payload.error_description || payload.error || `HTTP ${response.status}`);
	}
	return payload.refresh_token;
}

// ---- Import from the owner's existing folders (drive.readonly) ----

export type DriveImportFile = { id: string; name: string; mimeType: string; size: number };

const IMPORTABLE_MIME = /^(application\/pdf|text\/plain|text\/csv|text\/markdown)$/;

async function listChildren(parentId: string, extraQuery = '') {
	const files: (DriveFile & { size?: string })[] = [];
	let pageToken = '';

	do {
		const params = new URLSearchParams({
			q: `'${parentId}' in parents and trashed = false${extraQuery}`,
			fields: 'nextPageToken, files(id,name,mimeType,size)',
			spaces: 'drive',
			pageSize: '1000',
			orderBy: 'name'
		});
		if (pageToken) params.set('pageToken', pageToken);
		const response = await driveFetch(`${API}/files?${params}`);
		const payload = (await response.json()) as {
			files?: (DriveFile & { size?: string })[];
			nextPageToken?: string;
		};
		files.push(...(payload.files ?? []));
		pageToken = payload.nextPageToken ?? '';
	} while (pageToken);

	return files;
}

/** Finds a folder anywhere in the owner's Drive by its exact name (case-insensitive fallback). */
export async function driveFindFolder(name: string) {
	const params = new URLSearchParams({
		q: `mimeType = '${FOLDER_MIME}' and trashed = false and name contains '${escapeQuery(name)}'`,
		fields: 'files(id,name)',
		spaces: 'drive',
		pageSize: '50'
	});
	const response = await driveFetch(`${API}/files?${params}`);
	const folders = ((await response.json()) as { files?: DriveFile[] }).files ?? [];
	const normalize = (value: string) =>
		value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim();
	const wanted = normalize(name);
	return (
		folders.find((folder) => folder.name === name) ??
		folders.find((folder) => normalize(folder.name) === wanted) ??
		folders.find((folder) => normalize(folder.name).startsWith(wanted)) ??
		folders.find((folder) => normalize(folder.name).includes(wanted))
	);
}

/** A few folder names the app can see, to help when a name is not found. */
export async function driveVisibleFolderNames() {
	const params = new URLSearchParams({
		q: `mimeType = '${FOLDER_MIME}' and trashed = false and 'root' in parents`,
		fields: 'files(name)',
		spaces: 'drive',
		pageSize: '30',
		orderBy: 'name'
	});
	const response = await driveFetch(`${API}/files?${params}`);
	return (((await response.json()) as { files?: DriveFile[] }).files ?? []).map((f) => f.name);
}

/** Lists importable files of a folder and its subfolders (up to 3 levels). */
export async function driveListImportableFiles(folderId: string, depth = 0) {
	const result: DriveImportFile[] = [];
	for (const child of await listChildren(folderId)) {
		if (child.mimeType === FOLDER_MIME) {
			if (depth < 3) result.push(...(await driveListImportableFiles(child.id, depth + 1)));
			continue;
		}
		if (!child.mimeType || !IMPORTABLE_MIME.test(child.mimeType)) continue;
		result.push({
			id: child.id,
			name: child.name,
			mimeType: child.mimeType,
			size: Number(child.size ?? 0)
		});
	}
	return result;
}

export async function driveDownloadById(id: string) {
	const metaResponse = await driveFetch(
		`${API}/files/${encodeURIComponent(id)}?fields=id,name,mimeType,size`
	);
	if (metaResponse.status === 404) return undefined;
	const meta = (await metaResponse.json()) as DriveFile & { size?: string };
	if (!meta.mimeType || !IMPORTABLE_MIME.test(meta.mimeType)) return undefined;

	const response = await driveFetch(`${API}/files/${encodeURIComponent(id)}?alt=media`);
	if (response.status === 404) return undefined;
	return { meta, content: Buffer.from(await response.arrayBuffer()) };
}

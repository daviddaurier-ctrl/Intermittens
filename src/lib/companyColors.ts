export const companyColorPalette = [
	'#ff3d8b',
	'#ff8fb8',
	'#e0287d',
	'#c2185b',
	'#ff6f91',
	'#b04fd0',
	'#f06292',
	'#d81b60',
	'#ff9eb5',
	'#a3207a',
	'#ec407a',
	'#ff80ab'
];

function hashString(value: string) {
	let hash = 0;

	for (let index = 0; index < value.length; index += 1) {
		hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
	}

	return hash;
}

export function defaultCompanyColor(seed: string) {
	const index = hashString(seed || 'structure') % companyColorPalette.length;
	return companyColorPalette[index];
}

// Former palette (InterMittens): saved colors are moved to the matching pink shade.
const legacyPalette = [
	'#67d8c2', '#d9b15f', '#ef7d75', '#8fb7ff', '#b78cff', '#7ddc83',
	'#f095c8', '#6fd0ff', '#f0a15f', '#a6d86b', '#d889ff', '#8bd6a8'
];

export function normalizeCompanyColor(value: string, seed: string) {
	if (!/^#[0-9a-f]{6}$/i.test(value)) return defaultCompanyColor(seed);
	const legacyIndex = legacyPalette.indexOf(value.toLowerCase());
	return legacyIndex >= 0 ? companyColorPalette[legacyIndex] : value;
}

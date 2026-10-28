/**
 * Content-Disposition value that never makes the Response constructor throw.
 * HTTP headers only accept Latin-1, and file names written on a Mac carry decomposed
 * accents ("e" + U+0301). Sends an ASCII fallback plus the exact name per RFC 5987.
 */
export function inlineContentDisposition(fileName: string | undefined, fallback = 'document') {
	const name = (fileName || fallback).normalize('NFC');
	const asciiName =
		name
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^\x20-\x7e]/g, '_')
			.replace(/["\\]/g, '') || fallback;
	return `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

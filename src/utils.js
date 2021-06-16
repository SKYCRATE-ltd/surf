import { SLASH, AND, EQUAL, BAD_REQUEST, DO_NOTHING } from "constants.js";

export const CONCAT = (a, b) => {
	if (a === SLASH)
		a = '';
	if (b === SLASH)
		b = '';
	return `${a}/${b}`
		.replace(/\/\//g, SLASH)
		.replace(/\/\.\//g, SLASH)
		.replace(/\/[\w-]+\/\.\.\//g, SLASH);
}

export const DECODE = message => new TextDecoder("utf-8").decode(message);
export const BUFF = buffer =>
				buffer.buffer.slice(
					buffer.byteOffset,
					buffer.byteOffset + buffer.byteLength
				);

export const QUERY = (query, delim = AND) =>
	query ? Object.fromEntries(new Map(
		query.trim()
			.split(delim)
			.map(x => x.trim())
			.filter(DO_NOTHING) // Surprisingly, this does smthg; it removes empty strings!
			.map(pair =>
				pair.split(EQUAL)
					.map(x => decodeURIComponent(x.trim().replace(/\+/g, '%20')))
					.filter(DO_NOTHING)
			)
	)) : {};

export const VALIDATOR = (validator, hook) => async (req, res) => {
	const body = await req.body();
	if (validator(body))
		return await hook(body, req, res);
	return BAD_REQUEST;
};
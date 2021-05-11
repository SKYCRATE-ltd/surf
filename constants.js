import {STATUS_CODES} from "http";

export const CLOCK = [
	'🕐', '🕑', '🕒', '🕓',
	'🕔', '🕕', '🕖', '🕗',
	'🕘', '🕙', '🕚', '🕛',
];
export const SEMI = ';';
export const COLON = ':';
export const COMMA = ',';
export const EQUAL = '=';
export const PIPE = '|';
export const SLASH = '/';
export const AND = '&';
export const NEWLINE = '\n';

export const YIELD = Symbol('request yield');
export const HANDLED = Symbol('request handled');
export const DO_NOTHING = x => x;

export const STATUS =
	STATUS_CODES.map(
		([code, desc]) => [
			desc
				.replace(/\s+/g, '')
				.replace(/('|-)/g, ''),
			code
		]
	);
export const CODES = Object.fromEntries(new Map([
	'Normal',
	'GoingAway',
	'ProtocolError',
	'UnsupportedData',
	'None',
	'NoStatusReceived',
	'AbnormalClosure',
	'InvalidFrame',
	'PolicyViolation',
	'MessageTooBig',
	'MissingExtension',
	'InternalError',
	'ServiceRestart',
	'TryAgainLater',
	'BadGateway',
	'TLSHandshake'
].map((x, i) => [x, i + 1000])));

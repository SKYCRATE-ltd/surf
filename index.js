import {
	existsSync as exists,
	statSync as stats,
	createReadStream as read_stream,
} from "fs";

import mime from "mime";

import { uuid } from "computer";
import {
	is
} from "crux";
import {
	Type,
	Interface,
	Model,
	Class,
	Options,
	Emitter,
	UInt,
	Any,
	Hook
} from "zed";

import {
	CLOCK,
	SEMI,
	COLON,
	COMMA,
	EQUAL,
	PIPE,
	SLASH,
	AND,
	NEWLINE,

	STATUS,

	OK,
	YIELD,
	HANDLED,
	DO_NOTHING,
	BAD_REQUEST,
	UNAUTHORIZED,
	BAD_METHOD
} from "./src/constants.js";
import {STATUS_CODES} from "http";

export default function surf(name, router) {
	if (!router) {
		router = name;
		name = undefined;
	}
	const surf = new Surf(router);
	if (name)
		surf.middleware(
			(req, res) => res.title = name
		);
	return surf;
};
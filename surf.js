#!/usr/bin/env node

import {
	readlines,
	write
} from "computer";
import Program from "termite";

Program({
	["@default"]() {
		return this.pass('help');
	},
	help() {
		this.header('KOWABUNGA, DUDE!');
		this.list([
			`create <directory> -- create a new `,
			`sync <revision-name> -- synchronise your schema with your database.`
		]);
	},
	// Create a new project!
	create() {
		this.println('NOT YET IMPLEMENTED');
	},
	sync(name) {
		this.println('CONCAT SCHEMA FILES (NOT YET THOUGH)');
		this.println('NOT YET IMPLEMENTED');

		// We need to run the prisma migrate stuff
	},
	build() {
		// bundle front-end components
		// bundle front-end index
	},
	run() {

	}
})(...process.argv.slice(2));
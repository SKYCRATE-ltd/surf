#!/usr/bin/env node
import { fileURLToPath } from "url";
import { dirname } from "path";

import { exec, uuid } from "computer";

import yab from "yab";
import Program from "termite";

import Templates from "./bodyware/templates.js";
import JsonFiles from "./sessionware/json-files.js";

import surf from "./index.js";
import App from "./app.js";

const DIR = dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = `${DIR}/data/sessions`;
const PORT = process.env.PORT || 9001;

const BUILD = (name, daemon = false) => yab(
	daemon,
	`${DIR}/src/${name}.js`,
	`${DIR}/public/js/${name}.js`,
	`${DIR}/node_modules`
);

Program({
	["@default"]() {
		return this.pass('help');
	},
	help() {
		this.header('ONSLAUGHT');
		this.list([
			`build (--once*|--watch) :: build front-end components and main script`,
			`run :: start build deamon and run server`,
			`update (--user*|--dev) :: pull latest from repositories and dependencies`,
			`sync <revision-name> :: synchronise your schema with your database.`,
			`deploy :: run in production/testing environments -> syncs database schema`,
			`local <domain=onslaught.dev> :: create local nginx file for serving site as secure domain`
		]);
	},
	run() {
		// this.pass('build', '--watch');

		surf(
			new App(DIR)
		)
		.sessionware(
			new JsonFiles(SESSION_DIR)
		)
		.bodyware(
			new Templates('ONSLAUGHT', DIR),
		)
		.listen(PORT);
	},
	init() {
		exec(`npm install && npx prisma init`);
	},
	install() {
		// Some sort of service? /etc/system.d/smthg?
		// Or just a simple addition to nginx? Perhaps just these commands?
	},
	update(option = '--user') {
		exec(`git pull`);
		if (option === '--dev')
			exec(`rm package-lock.json && rm -rf node_modules && npm i`);
		else {
			exec(`npm i`);
			this.pass('sync', `UPDATE: ${uuid()}`);
		}
	},
	sync() {
		this.println('CONCAT SCHEMA FILES (NOT YET THOUGH)');
		exec(`npx prisma db push --accept-data-loss`); // If we're using db-push... we're prototyping anyway
	},
	migrate(name = uuid()) {
		this.println('CONCAT SCHEMA FILES (NOT YET THOUGH)');
		exec(`npx prisma migrate dev --name ${name}`);
	},
	deploy() {
		exec(`npm prisma migrate deploy`);
	},
	build(option = '--once') {
		const mode = option === '--watch' ? 'watch' : 'build';
		BUILD('components', mode);
		BUILD('index', mode);

	},
	local(domain = 'onslaught.dev') {
		srvr('create', domain, DIR, PORT); // How best to ensure the ports match-up?
		srvr('add', domain, DIR); // > add domain to hosts file and add /etc/<domain> to nginx
	},
})(...process.argv.slice(2));
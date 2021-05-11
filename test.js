 import {
	fileURLToPath
} from "url";
import {
	dirname
} from "path";

import { uuid } from "computer";
import { Model } from "zed";

import surf from "./index.js";
import Templates from "./bodyware/templates.js";
import Directory from "./routers/directory.js";
import JsonFiles from "./sessionware/json-files.js";

// import prisma from "@prisma/client";
// const { PrismaClient } = prisma;

class Update extends Model({
	sender: String,
	message: String,
	timestamp: Date,
}) {
	constructor({
		sender = 'N/A',
		message = 'N/A',
		timestamp = new Date()
	}) {
		super({
			sender,
			message,
			timestamp
		});
	}
}

class Chat {
	id;
	name;
	messages;

	constructor(id, name) {
		this.id = id;
		this.name = name;
		this.messages = [];
	}
	get(count = Number.POSITIVE_INFINITY) {
		return this.messages.slice(0, count);
	}
	add(...msgs) {
		this.messages.unshift(...msgs);
		return this;
	}
}

class Rooms extends Map {
	create(name, id = uuid()) {
		if (this.has(id))
			return this.create(name);
		return this.set(id, new Chat(id, name)).get(id);
	}
}

const DIR = dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = `${DIR}/data/sessions`;
const CHATROOMS = new Rooms;
// const DB = new PrismaClient(); // <-- Cool. Cool cool cool. It's all about the db, baby.

surf({
	...new Directory(`${DIR}/public/icons`), // Append our icons to the root
	...new Directory(`${DIR}/public`, "icons/"), // Append our public folder (except icons/) to root.
	"/": {
		get(req, res) {
			res.title = 'Surf Chat Server';
			return [...CHATROOMS.values()];
		},
		async post(req, res) {
			const {id} = CHATROOMS.create((await req.body()).name);
			return res.redirect(`./${id}`);
		}
	},
	"/:chat_id": {
		get(req, res) {
			const chatroom = CHATROOMS.get(req.args?.chat_id);

			if (!chatroom)
				return res.not_found();
			
			const [
				{id, name},
				messages
			] = [chatroom, chatroom.get(10)?.reverse()];
			
			res.title = `Chat Room "${name}"`;
			return {
				id,
				name,
				messages
			};
		},
		listen({id, sender, message}, socket, peers) {
			const update = new Update({
				sender, message
			});
			CHATROOMS.get(id)?.add(update);
			return peers.send(update);
		}
	},
})
.sessionware(
	new JsonFiles(SESSION_DIR)
)
.middleware((req, res) => {
	// Right... So here we need
})
.bodyware(
	new Templates('WAVE', DIR),
)
.listen(9009);


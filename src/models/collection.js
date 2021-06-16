// We're gonna shift Collection to be slightly different...
// It'll be the cruz of a lot of things!
import { is } from "crux";
import { Procedure } from "zed";

export const Where = Procedure({
	init(property, value) {
		if (is.object(value))
		return () => {

		}
	}
});

export class Query extends Type {
	#hooks = {};

	constructor(query, data) {
		this.#hooks = hooks;
		super();
	}

	select() {
		// How we select things...
	}

	where(list, where) {

		return list.filter(item => );
	}

	include() {
		// Only useful for bridging tables...
		// Might not need to implement for JSON or REDIS or whatever.
	}

	orderBy() {

	}

	distinct() {

	}
}

export default class Collection extends Type {
	#hooks;

	// Hooks allow us to quickly implement a collection's I/O.
	constructor(hooks) {
		super();
		this.#hooks = hooks;
		this.#type = Interface(descriptor);

		hooks.init?.(this);
	}

	create({
		data,
		select,
		include
	} = {}) {
		if (!data)
			throw `We've got an error... needs to be handled.`;
		this.#hooks.create;
	}

	findMany() {
		//
	}

	findFirst() {
		//
	}

	findUnique() {
		//
	}

	update({
		data,
		where
	}) {
		//
	}

	upsert() {
		//
	}

	updateMany() {
		//
	}

	delete() {
		//
	}

	deleteMany() {
		//
	}

	get(id) {
		const session = super.get(id);
		if (session) {
			return this.#hooks.get?.(session) || session;
		}
		return session;
	}

	set(id, session) {
		// That is not something we necessaril do...
		super.set(id, session);
		
		return session;
	}

	update(id, data) {
		const session = this.get(id);

		if (session) {
			session.update(data);

			this.#hooks.update?.(session);
		}
		return this;
	}

	delete(id) {
		return super.delete(this.#hooks.delete?.(id) || id);
	}
}
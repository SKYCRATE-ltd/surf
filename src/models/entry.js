import { Type, Any } from "zed";

export default class Entry extends Type({
	id: String,
	createdAt: Date,
	updatedAt: Date,
	expiresAt: Date,
	data: Any,
}) {
	constructor(values) {
		super(values);
		if (!this.expiresAt)
			this.reset();
	}

	update(data) {
		this.data = this.data?.assign(data) ?? data;
		return this.reset();
	}

	reset(duration = 60000 * 10/* 10 mins from now is the default, baby */) {
		this.expiresAt = new Date(Date.now() + duration);
		return this;
	}

	expired(date = new Date()) {
		return this.expiresAt.getTime() < date.getTime();
	}
}
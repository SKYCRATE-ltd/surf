import crypto from "crypto";
import { Type, Class, Interface, Options, Model } from "zed";

export class Binary extends Type {
	static validate() {
		return false;
	}
	static defines(instance) {
		return instance.constructor === ArrayBuffer ||
					instance.constructor.__proto__ === Uint8Array ||
						instance.constructor.__proto__ === Uint8Array.constructor.__proto__;
	}
}

export const File = Model(`File<...T>`, {
	init(...mime_types) {
		return Interface(`File<${mime_types.join(PIPE)}>`, {
			filename: String,
			type: Options(...mime_types),
			data: Binary, // <-- This should work...
		});
	}
});

export class Username extends Class(String) {
	static validate(str) {
		// SHould we allow any other characters?
		return /^[a-z0-9-_=\.$]+$/i.test(str);
	}
};

export class Password extends Class(String) {
	static validate(str) {
		/**
		 * At least one of each:
		 * 
		 * 		- one lower case letter			97-122				+1
		 * 		- one UPPER CASE letter			65-90				+3
		 * 		- one number					48-57				+5
		 * 		- one special character  33-47,58-64,91-96,123-126	+7
		 * 		- length of min: EIGHT, max: TWENTY
		 */
		return // hmmm we gotta think abnout thsi! We want it to be efficient
	}

	static score(password) {
		
	}

	static hash(password, salt) {
		//
	}
}

export class OneLiner extends Class(String) {
	static validate(str) {
		return /^[^\n\r]/.test(str);
	}
}

export class Email extends Class(String, {
	user: String,
	domain: String
}) {
	constructor(...args) {
		super(...args);
		const [
			user,
			domain
		] = this.split('@');
		this.user = user;
		this.domain = domain;
	}
	toString() {
		return `${this.user}@${this.domain}`;
	}
	static validate(str) {
		return /^\S+@\S+\.\S+$/.test(str);
	}
}

export class PhoneNumber extends Class(String) {
	// All these types will be good for chatbots... need to store these elsewhere....
}
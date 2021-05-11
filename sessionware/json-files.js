import { read_dir, read, write, del } from "computer";
import { Type } from "zed";

export default class JsonFiles extends Type {
	constructor(SESSION_DIR = './data/sessions') {
		super({
			init(sessions) {
				sessions.load(read_dir(SESSION_DIR)
					.map(
						id => [
							id,
							JSON.parse(read(`${SESSION_DIR}/${id}`) || 'null')
						]
					)
					.filter(([id, item]) => item)
				);
			},
			create(session) {
				write(`${SESSION_DIR}/${session.id}`, JSON.stringify(session));
				return session;
			},
			update(session) {
				write(`${SESSION_DIR}/${session.id}`, JSON.stringify(session));
				return session;
			},
			delete(id) {
				del(`${SESSION_DIR}/${id}`);
				return id;
			}
		});
	}
}
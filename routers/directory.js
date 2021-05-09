import { read_dir, is_directory, is_file } from "computer";
import { Router } from "../index.js";
import File from "./file.js";

export default class Directory extends Router {
	constructor(directory = '.', recursive = false) {
		const hooks = {};

		read_dir(directory).forEach(inode => {
			const mount = `/${inode}`;
			const path = `${directory}/${inode}`;

			if (recursive && is_directory(path))
				hooks[mount] = new Directory(path, true);
			
			else if (is_file(path))
				hooks[mount] = new File(path);
		});

		// console.log(hooks);

		super(hooks);
	}
}
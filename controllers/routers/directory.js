import { read_dir, is_directory, is_file } from "computer";
import { Class } from "zed";
import { SLASH } from "../../src/constants.js";
import { Router } from "../../index.js";
import File from "../endpoints/file.js.js";

export default class Directory extends Class(Router) {
	constructor(directory = '.', ...blacklist) {
		const hooks = {};
		blacklist = blacklist.map(path => path.endsWith(SLASH) ? path.slice(0, -1) : path);

		const inodes = read_dir(directory)
						.filter(inode => !blacklist.includes(inode));
		
		hooks[SLASH] = () => [...inodes];

		inodes.forEach(inode => {
			const mount = `/${inode}`;
			const path = `${directory}/${inode}`;

			if (is_directory(path))
				hooks[mount] = new Directory(
					path,
					...blacklist.map(
						path => path.split(SLASH).slice(1).join(SLASH)
					).filter(x => x)
				);
			
			else if (is_file(path))
				hooks[mount] = new File(path);
		});

		super(`📁 ${directory}`, hooks);
	}
}
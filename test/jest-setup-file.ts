import "reflect-metadata";

import type { Config } from "jest";

process.env.TEST_DB_FILE = "false";

const config: Config = {
	testTimeout: 150000,
	//testTimeout: 5000
};

export default config;

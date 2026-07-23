#!/usr/bin/env node
/**
 * 将共享 React / tldraw 运行时从 dependencies 迁移到：
 * - peerDependencies：由 apps/desktop 统一提供
 * - devDependencies：供本包本地 typecheck / test 使用
 *
 * 目标包：
 * - editor/core
 * - features/flowchart
 * - features/freehand
 * - features/scientific-plot
 *
 * 用法：
 *   node scripts/migrate-shared-ui-peers.mjs
 *
 * 可选校验模式（不写文件）：
 *   node scripts/migrate-shared-ui-peers.mjs --check
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const CHECK_ONLY = process.argv.includes("--check");

const PEER_VERSIONS = {
	react: "19.2.7",
	"react-dom": "19.2.7",
	tldraw: "5.2.5",
};

const DEV_VERSIONS = {
	react: "catalog:",
	"react-dom": "catalog:",
	tldraw: "catalog:",
	"@types/react": "catalog:",
	"@types/react-dom": "catalog:",
	typescript: "catalog:",
};

// 仅修改真正导出 React/tldraw 扩展能力的包。
// apps/desktop 是 composition root，必须继续在 dependencies 中持有运行时。
const TARGETS = [
	{
		file: "editor/core/package.json",
		move: ["tldraw"],
	},
	{
		file: "features/flowchart/package.json",
		move: ["react", "react-dom", "tldraw"],
	},
	{
		file: "features/freehand/package.json",
		move: ["react", "react-dom", "tldraw"],
	},
	{
		file: "features/scientific-plot/package.json",
		move: ["react", "react-dom", "tldraw"],
	},
];

function sortKeys(object) {
	return Object.fromEntries(
		Object.entries(object).sort(([left], [right]) => left.localeCompare(right)),
	);
}

function normalizeJsonText(raw) {
	return raw.replace(/^\uFEFF/, "");
}

function assertRuntimeDependency(packageJson, packageFile, dependency) {
	const isDependency = packageJson.dependencies?.[dependency] !== undefined;
	const isPeer = packageJson.peerDependencies?.[dependency] !== undefined;

	if (!isDependency && !isPeer) {
		throw new Error(
			`${packageFile}: 找不到 "${dependency}"，拒绝猜测或静默修改。`,
		);
	}
}

function migratePackage(packageJson, packageFile, runtimeDependencies) {
	const next = structuredClone(packageJson);

	next.dependencies ??= {};
	next.peerDependencies ??= {};
	next.devDependencies ??= {};

	for (const dependency of runtimeDependencies) {
		assertRuntimeDependency(next, packageFile, dependency);

		delete next.dependencies[dependency];

		// 此仓库采取 runtime lockstep：peer 明确要求同一版本。
		next.peerDependencies[dependency] = PEER_VERSIONS[dependency];

		// pnpm catalog 负责本地开发、类型检查和测试的统一版本。
		next.devDependencies[dependency] = DEV_VERSIONS[dependency];
	}

	// 只要包导出 React/tldraw UI，开发环境也应具备 React 类型与 TypeScript。
	const exportsReactUi = runtimeDependencies.some((name) =>
		["react", "react-dom", "tldraw"].includes(name),
	);

	if (exportsReactUi) {
		for (const dependency of [
			"@types/react",
			"@types/react-dom",
			"typescript",
		]) {
			next.devDependencies[dependency] ??= DEV_VERSIONS[dependency];
		}
	}

	if (Object.keys(next.dependencies).length === 0) {
		delete next.dependencies;
	} else {
		next.dependencies = sortKeys(next.dependencies);
	}

	next.peerDependencies = sortKeys(next.peerDependencies);
	next.devDependencies = sortKeys(next.devDependencies);

	return next;
}

function verifyPackage(packageJson, packageFile, runtimeDependencies) {
	const errors = [];

	for (const dependency of runtimeDependencies) {
		if (packageJson.dependencies?.[dependency] !== undefined) {
			errors.push(
				`${packageFile}: "${dependency}" 仍位于 dependencies 中。`,
			);
		}

		if (packageJson.peerDependencies?.[dependency] !== PEER_VERSIONS[dependency]) {
			errors.push(
				`${packageFile}: peerDependencies["${dependency}"] 必须为 "${PEER_VERSIONS[dependency]}"。`,
			);
		}

		if (packageJson.devDependencies?.[dependency] !== DEV_VERSIONS[dependency]) {
			errors.push(
				`${packageFile}: devDependencies["${dependency}"] 必须为 "${DEV_VERSIONS[dependency]}"。`,
			);
		}
	}

	return errors;
}

const allErrors = [];

for (const target of TARGETS) {
	const absoluteFile = path.join(ROOT, target.file);
	const raw = await readFile(absoluteFile, "utf8");
	const original = JSON.parse(normalizeJsonText(raw));

	if (CHECK_ONLY) {
		allErrors.push(...verifyPackage(original, target.file, target.move));
		continue;
	}

	const migrated = migratePackage(original, target.file, target.move);
	const output = `${JSON.stringify(migrated, null, 2)}\n`;

	if (normalizeJsonText(raw) === output) {
		console.log(`unchanged  ${target.file}`);
		continue;
	}

	await writeFile(absoluteFile, output, "utf8");
	console.log(`updated    ${target.file}`);
}

if (CHECK_ONLY) {
	if (allErrors.length > 0) {
		console.error("\nPeer dependency 架构校验失败：");
		for (const error of allErrors) {
			console.error(`- ${error}`);
		}
		process.exitCode = 1;
	} else {
		console.log("Peer dependency 架构校验通过。");
	}
}
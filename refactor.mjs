#!/usr/bin/env node
/**
 * 一次性 shared-runtime 依赖重构。
 *
 * 最终模型：
 * - apps/desktop：唯一 runtime host，持有 React / React DOM / tldraw dependencies。
 * - React UI / tldraw extension：runtime 位于 peerDependencies + devDependencies。
 * - 非 UI 但公开使用 tldraw API 的 editor library：仅 tldraw 位于 peerDependencies + devDependencies。
 * - 测试包：tldraw 仅作为 devDependency，绝不进入 dependencies / peerDependencies。
 *
 * 用法：
 *   node refactor.mjs --write
 *   node refactor.mjs --check
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const WRITE = process.argv.includes("--write");
const CHECK = process.argv.includes("--check");

if (WRITE === CHECK) {
	throw new Error("必须且只能使用一个参数：--write 或 --check");
}

const RUNTIME_VERSIONS = Object.freeze({
	react: "19.2.7",
	"react-dom": "19.2.7",
	tldraw: "5.2.5",
});

const CATALOG_VERSION = "catalog:";

const REACT_TYPECHECK_DEPS = Object.freeze({
	"@types/react": CATALOG_VERSION,
	"@types/react-dom": CATALOG_VERSION,
	typescript: CATALOG_VERSION,
});

const TLDRAW_TYPECHECK_DEPS = Object.freeze({
	typescript: CATALOG_VERSION,
});

/**
 * 这是明确的架构清单，不根据源码 import 自动猜测职责。
 *
 * 新增一个使用共享 runtime 的包，必须先明确它是：
 * - runtime-host
 * - react-library
 * - tldraw-extension
 * - tldraw-library
 * - test-only
 */
const PACKAGE_BOUNDARIES = Object.freeze({
	"@hybrid-canvas/desktop": {
		file: "apps/desktop/package.json",
		kind: "runtime-host",
		runtimes: ["react", "react-dom", "tldraw"],
	},

	"@hybrid-canvas/canvas": {
		file: "editor/core/package.json",
		kind: "tldraw-extension",
		runtimes: ["react", "react-dom", "tldraw"],
	},

	"@hybrid-canvas/document": {
		file: "editor/document/package.json",
		kind: "tldraw-library",
		runtimes: ["tldraw"],
	},

	"@hybrid-canvas/file": {
		file: "editor/persistence/package.json",
		kind: "tldraw-library",
		runtimes: ["tldraw"],
	},

	"@hybrid-canvas/flowchart": {
		file: "features/flowchart/package.json",
		kind: "tldraw-extension",
		runtimes: ["react", "react-dom", "tldraw"],
	},

	"@hybrid-canvas/freehand": {
		file: "features/freehand/package.json",
		kind: "tldraw-extension",
		runtimes: ["react", "react-dom", "tldraw"],
	},

	"@hybrid-canvas/scientific-plot": {
		file: "features/scientific-plot/package.json",
		kind: "tldraw-extension",
		runtimes: ["react", "react-dom", "tldraw"],
	},

	"@hybrid-canvas/settings": {
		file: "features/settings/package.json",
		kind: "react-library",
		runtimes: ["react", "react-dom"],
	},

	"@hybrid-canvas/workspace": {
		file: "features/workspace/package.json",
		kind: "react-library",
		runtimes: ["react", "react-dom"],
	},

	"@hybrid-canvas/design-system": {
		file: "foundations/design-system/package.json",
		kind: "react-library",
		runtimes: ["react", "react-dom"],
	},

	"@hybrid-canvas/test-cross-domain-contract": {
		file: "tests/cross-domain-contract/package.json",
		kind: "test-only",
		runtimes: ["tldraw"],
	},
});

const WORKSPACE_DIRECTORIES = Object.freeze([
	"apps",
	"editor",
	"features",
	"foundations",
	"platforms",
	"tooling",
	"tests",
]);

function sortObject(object) {
	return Object.fromEntries(
		Object.entries(object).sort(([left], [right]) => left.localeCompare(right)),
	);
}

function removeEmptyDependencyFields(packageJson) {
	for (const field of ["dependencies", "peerDependencies", "devDependencies"]) {
		if (Object.keys(packageJson[field] ?? {}).length === 0) {
			delete packageJson[field];
		}
	}
}

function normalizeDependencyFields(packageJson) {
	for (const field of ["dependencies", "peerDependencies", "devDependencies"]) {
		if (packageJson[field]) {
			packageJson[field] = sortObject(packageJson[field]);
		}
	}
}

function cloneJson(value) {
	return JSON.parse(JSON.stringify(value));
}

function hasDependency(packageJson, field, dependency) {
	return packageJson[field]?.[dependency] !== undefined;
}

function dependencyVersion(packageJson, field, dependency) {
	return packageJson[field]?.[dependency];
}

function addDevDependencies(packageJson, dependencies) {
	packageJson.devDependencies ??= {};

	for (const [name, version] of Object.entries(dependencies)) {
		packageJson.devDependencies[name] = version;
	}
}

function removeRuntimeFromAllFields(packageJson, runtime) {
	delete packageJson.dependencies?.[runtime];
	delete packageJson.peerDependencies?.[runtime];
	delete packageJson.devDependencies?.[runtime];
}

function applyRuntimeHost(packageJson, boundary) {
	packageJson.dependencies ??= {};

	for (const runtime of boundary.runtimes) {
		removeRuntimeFromAllFields(packageJson, runtime);
		packageJson.dependencies[runtime] = CATALOG_VERSION;
	}
}

function applySharedRuntimePackage(packageJson, boundary) {
	packageJson.peerDependencies ??= {};
	packageJson.devDependencies ??= {};

	for (const runtime of boundary.runtimes) {
		removeRuntimeFromAllFields(packageJson, runtime);
		packageJson.peerDependencies[runtime] = RUNTIME_VERSIONS[runtime];
		packageJson.devDependencies[runtime] = CATALOG_VERSION;
	}

	if (
		boundary.kind === "react-library" ||
		boundary.kind === "tldraw-extension"
	) {
		addDevDependencies(packageJson, REACT_TYPECHECK_DEPS);
	} else {
		addDevDependencies(packageJson, TLDRAW_TYPECHECK_DEPS);
	}
}

function applyTestOnlyPackage(packageJson, boundary) {
	packageJson.devDependencies ??= {};

	for (const runtime of boundary.runtimes) {
		removeRuntimeFromAllFields(packageJson, runtime);
		packageJson.devDependencies[runtime] = CATALOG_VERSION;
	}

	addDevDependencies(packageJson, TLDRAW_TYPECHECK_DEPS);
}

function applyBoundary(packageJson, boundary) {
	const next = cloneJson(packageJson);

	switch (boundary.kind) {
		case "runtime-host":
			applyRuntimeHost(next, boundary);
			break;

		case "react-library":
		case "tldraw-extension":
		case "tldraw-library":
			applySharedRuntimePackage(next, boundary);
			break;

		case "test-only":
			applyTestOnlyPackage(next, boundary);
			break;

		default:
			throw new Error(`未知架构角色：${boundary.kind}`);
	}

	removeEmptyDependencyFields(next);
	normalizeDependencyFields(next);

	return next;
}

function verifyNoUnexpectedRuntime(packageJson, boundary, label, errors) {
	const allowed = new Set(boundary.runtimes);

	for (const runtime of Object.keys(RUNTIME_VERSIONS)) {
		if (allowed.has(runtime)) {
			continue;
		}

		for (const field of [
			"dependencies",
			"peerDependencies",
			"devDependencies",
		]) {
			if (hasDependency(packageJson, field, runtime)) {
				errors.push(
					`${label}: "${runtime}" 不属于该包的 runtime boundary，不得位于 ${field}。`,
				);
			}
		}
	}
}

function verifyRuntimeHost(packageJson, boundary, label, errors) {
	for (const runtime of boundary.runtimes) {
		if (
			dependencyVersion(packageJson, "dependencies", runtime) !==
			CATALOG_VERSION
		) {
			errors.push(
				`${label}: runtime host 必须在 dependencies 中声明 "${runtime}": "${CATALOG_VERSION}"。`,
			);
		}

		for (const field of ["peerDependencies", "devDependencies"]) {
			if (hasDependency(packageJson, field, runtime)) {
				errors.push(
					`${label}: runtime host 不得在 ${field} 中声明 "${runtime}"。`,
				);
			}
		}
	}
}

function verifySharedRuntimePackage(packageJson, boundary, label, errors) {
	for (const runtime of boundary.runtimes) {
		if (hasDependency(packageJson, "dependencies", runtime)) {
			errors.push(
				`${label}: "${runtime}" 不得位于 dependencies；必须由 desktop runtime host 提供。`,
			);
		}

		if (
			dependencyVersion(packageJson, "peerDependencies", runtime) !==
			RUNTIME_VERSIONS[runtime]
		) {
			errors.push(
				`${label}: peerDependencies["${runtime}"] 必须为 "${RUNTIME_VERSIONS[runtime]}"。`,
			);
		}

		if (
			dependencyVersion(packageJson, "devDependencies", runtime) !==
			CATALOG_VERSION
		) {
			errors.push(
				`${label}: devDependencies["${runtime}"] 必须为 "${CATALOG_VERSION}"。`,
			);
		}
	}

	const requiredDevDependencies =
		boundary.kind === "react-library" ||
		boundary.kind === "tldraw-extension"
			? REACT_TYPECHECK_DEPS
			: TLDRAW_TYPECHECK_DEPS;

	for (const [dependency, expectedVersion] of Object.entries(
		requiredDevDependencies,
	)) {
		if (
			dependencyVersion(packageJson, "devDependencies", dependency) !==
			expectedVersion
		) {
			errors.push(
				`${label}: devDependencies["${dependency}"] 必须为 "${expectedVersion}"。`,
			);
		}
	}
}

function verifyTestOnlyPackage(packageJson, boundary, label, errors) {
	for (const runtime of boundary.runtimes) {
		if (hasDependency(packageJson, "dependencies", runtime)) {
			errors.push(
				`${label}: 测试包不得在 dependencies 中声明 "${runtime}"。`,
			);
		}

		if (hasDependency(packageJson, "peerDependencies", runtime)) {
			errors.push(
				`${label}: 测试包不得在 peerDependencies 中声明 "${runtime}"。`,
			);
		}

		if (
			dependencyVersion(packageJson, "devDependencies", runtime) !==
			CATALOG_VERSION
		) {
			errors.push(
				`${label}: 测试包必须在 devDependencies 中声明 "${runtime}": "${CATALOG_VERSION}"。`,
			);
		}
	}
}

function verifyBoundary(packageJson, boundary, label, errors) {
	verifyNoUnexpectedRuntime(packageJson, boundary, label, errors);

	switch (boundary.kind) {
		case "runtime-host":
			verifyRuntimeHost(packageJson, boundary, label, errors);
			break;

		case "react-library":
		case "tldraw-extension":
		case "tldraw-library":
			verifySharedRuntimePackage(packageJson, boundary, label, errors);
			break;

		case "test-only":
			verifyTestOnlyPackage(packageJson, boundary, label, errors);
			break;

		default:
			errors.push(`${label}: 未知架构角色 "${boundary.kind}"。`);
	}
}

function verifyUnregisteredPackage(packageJson, relativeFile, errors) {
	for (const runtime of Object.keys(RUNTIME_VERSIONS)) {
		for (const field of [
			"dependencies",
			"peerDependencies",
			"devDependencies",
		]) {
			if (hasDependency(packageJson, field, runtime)) {
				errors.push(
					`${packageJson.name} (${relativeFile}): 未登记 package 不得声明 "${runtime}"；必须先在 PACKAGE_BOUNDARIES 中定义架构角色。`,
				);
			}
		}
	}
}

async function readJson(relativeFile) {
	const raw = await readFile(path.join(ROOT, relativeFile), "utf8");

	try {
		return JSON.parse(raw.replace(/^\uFEFF/, ""));
	} catch (error) {
		throw new Error(`${relativeFile}: 无法解析 JSON：${error.message}`);
	}
}

async function discoverWorkspacePackageFiles() {
	const files = [];

	for (const directory of WORKSPACE_DIRECTORIES) {
		const entries = await readdir(path.join(ROOT, directory), {
			withFileTypes: true,
		});

		for (const entry of entries) {
			if (!entry.isDirectory()) {
				continue;
			}

			// 强制使用 POSIX 路径作为架构清单的稳定标识。
			const relativeFile = path.posix.join(
				directory,
				entry.name,
				"package.json",
			);

			try {
				await readFile(path.join(ROOT, relativeFile), "utf8");
				files.push(relativeFile);
			} catch (error) {
				if (error.code !== "ENOENT") {
					throw error;
				}
			}
		}
	}

	return files.sort();
}

async function main() {
	const errors = [];
	const packageFiles = await discoverWorkspacePackageFiles();
	const discoveredFiles = new Set(packageFiles);

	for (const [packageName, boundary] of Object.entries(PACKAGE_BOUNDARIES)) {
		if (!discoveredFiles.has(boundary.file)) {
			errors.push(
				`${packageName}: 架构清单中的 package 文件不存在：${boundary.file}。`,
			);
		}
	}

	for (const relativeFile of packageFiles) {
		const packageJson = await readJson(relativeFile);
		const boundary = PACKAGE_BOUNDARIES[packageJson.name];
		const label = `${packageJson.name ?? "<unnamed>"} (${relativeFile})`;

		if (!boundary) {
			verifyUnregisteredPackage(packageJson, relativeFile, errors);
			continue;
		}

		if (boundary.file !== relativeFile) {
			errors.push(
				`${label}: 架构清单路径必须为 "${boundary.file}"，实际为 "${relativeFile}"。`,
			);
			continue;
		}

		if (WRITE) {
			const migrated = applyBoundary(packageJson, boundary);
			const output = `${JSON.stringify(migrated, null, 2)}\n`;
			const original = `${JSON.stringify(packageJson, null, 2)}\n`;

			if (output !== original) {
				await writeFile(path.join(ROOT, relativeFile), output, "utf8");
				console.log(`updated  ${relativeFile}`);
			} else {
				console.log(`unchanged ${relativeFile}`);
			}

			verifyBoundary(migrated, boundary, label, errors);
		} else {
			verifyBoundary(packageJson, boundary, label, errors);
		}
	}

	if (errors.length > 0) {
		console.error("\nShared runtime dependency boundary 违反：\n");

		for (const error of errors) {
			console.error(`- ${error}`);
		}

		process.exitCode = 1;
		return;
	}

	console.log(
		"\nShared runtime dependency boundary 通过：runtime host、peer runtime 与 test-only dependency model 一致。",
	);
}

await main();
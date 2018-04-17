const gulp = require('gulp'),
	util = require('gulp-util'),
	newfile = require('gulp-file'),
	path = require('path'),
	debug = require('gulp-debug'),
	xpath = require('xpath'),
	dom = require('xmldom').DOMParser,
	fs = require('fs'),
	through2 = require('through2'),
	PluginError = util.PluginError,
	NamedRegExp = require('named-regexp-groups');

const PLUGIN_NAME = "GenerateBundleJson";

let workingDir = util.env.path && util.env.path.replace ? util.env.path.replace(/"'"/g, '') : null;
workingDir = workingDir && workingDir.replace ? workingDir.replace(/'/g, '') : null;

console.log(`working on ${workingDir}`);

function createBundle(outputFileName, minOutputFileName, inputFiles, enabledMinify, renameLocals, includeSourceMaps) {
	return {
		outputFileName: outputFileName,
		inputFiles: inputFiles,
		minify: {
			enabled: enabledMinify,
			renameLocals: renameLocals,
			minFileName: minOutputFileName,
		},
		sourceMap: includeSourceMaps
	}
};

function execute_Regex(outputFileName, minOutputFileName, content, customFunction) {
	var inputFiles = [];
	var cssImportRegex = new NamedRegExp('\\s*@import\\s+url\\("\\s*(?<CSS>.+\\.css\\s*)"\\)\\s*;', 'ig');
	while (match = cssImportRegex.exec(content)) {
		inputFiles.push(customFunction(match.groups.CSS));
	}
	return createBundle(outputFileName, minOutputFileName, inputFiles, true, true, true);;
}

function execute_XPath(outputFileName, minOutputFileName, content, strXPath, objNamespaces, customFunction) {

	if (!content) {
		throw new PluginError(PLUGIN_NAME, 'No content given!');
	}
	if (!strXPath) {
		throw new PluginError(PLUGIN_NAME, 'Missing xpath text!');

	}

	var objNamespaces = objNamespaces || {};

	if (!customFunction) var customFunction = custFunc;

	// default namespaces
	objNamespaces['xsl'] = 'http://www.w3.org/1999/XSL/Transform';

	var doc = new dom().parseFromString(content);
	var select = xpath.useNamespaces(objNamespaces);
	var result = select(strXPath, doc);
	var loops = result.length;

	var inputFiles = [];
	for (i = 0; i < loops; i++) {
		inputFiles.push(customFunction(result[i]));
	}

	return createBundle(outputFileName, minOutputFileName, inputFiles, true, true, true);;
}

var result = { fileName: path.join(workingDir, "bundleconfig.json"), content: [] };


function start(file, enc, next) {
	
	if (file.isStream()) {
		this.emit('error', new PluginError(PLUGIN_NAME, 'Streams are not supported!'));
	}

	var fileName = path.basename(file.path);
	var fileExt = path.extname(file.path);
	var outputFileName = "", minOutputFileName = "";
	var newContent = "";

	//Regular Expression for filtering js and css files into groups
	var fileInfoRegex = new NamedRegExp('(?:(?<JSModule>[.]jsmodule)|(?<JSDebug>[^.-]+[.-]debug[.]js)|(?<StyleDebug>style-debug[.]css)|(?<JS>.+[.]js)|(?<css>.+[.]css))$', 'g');
	var regexRes = null;

	try
	{
		fileInfoRegex.exec(fileName);
	}
	catch(e){
		console.log(e);
		next();
	}
	
	if(!regexRes) next(); //file ending is not supported

	var fileInformation = regexRes.groups //JSDebug,JSModule,StyleDebug,JS,CSS
	if (!file.isBuffer()) next(); //file is blank

	if (fileInformation.JSModule) {
		outputFileName = file.path && file.path.replace ? file.path.replace(fileExt, '-module-debug.js') : null;
		minOutputFileName = file.path && file.path.replace ? file.path.replace(fileExt, '-module.js') : null;
		var contents = file.contents.toString();
		if (contents) {
			var newBundle = execute_XPath(outputFileName, minOutputFileName, contents, "//*[local-name() = 'Files'][@Include]/@Include", {},
				function (node) {
					return path.resolve(path.dirname(file.path), node.nodeValue);
				}
			);
			result.content.push(newBundle);
		}
	}
	else if (fileInformation.JS) {
		//outputFileName = file.path && file.path.replace ? file.path.replace(fileExt, '.min' + fileExt) : null;
		console.log("ignoring");
	}
	else if (fileInformation.JSDebug) {
		outputFileName = file.path;
		minOutputFileName = file.path && file.path.replace ? file.path.replace(/-debug.js$|.debug.js$/i, fileExt) : null;
		var newBundle = createBundle(outputFileName, minOutputFileName, [file.path], true, true, true);
		result.content.push(newBundle);
	}
	else if (fileInformation.CSS) {
		//outputFileName = file.path && file.path.replace ? file.path.replace(fileExt, '.min' + fileExt) : null;
		console.log("ignoring");
	}
	else if (fileInformation.StyleDebug) {
		outputFileName = file.path;
		minOutputFileName = file.path && file.path.replace ? file.path.replace(/style-debug.css$/i, 'style-min.css') : null;
		var contents = file.contents.toString();
		if (contents) {
			var newBundle = execute_Regex(outputFileName, minOutputFileName, contents,
				function (fileName) {
					return path.resolve(path.dirname(file.path), fileName);
				}
			);
			result.content.push(newBundle);
		}
		var newBundle = createBundle(outputFileName, minOutputFileName, [file.path], true, true, true);
		result.content.push(newBundle);
	}
	next();
}

function endStream(cb) {
	try {
		var json = JSON.stringify(result.content, undefined, '\t');
		this.push(new util.File({ cwd: "", base: "", path: result.fileName, contents: new Buffer(json) }));
	}
	catch (e) {
		this.emit('error', new PluginError(PLUGIN_NAME, e));
	}
	cb();
}

function generateBundleJson() {
	'use strict';
	return through2.obj(start, endStream);
}

gulp.task('default', function () {
	//implementation of the task		
	if (!workingDir) throw new PluginError(PLUGIN_NAME, 'Working path not defined!');

	var js_module = path.join(workingDir, '\\**\\*.jsmodule');
	var js_debug = path.join(workingDir, '\\**\\*.js');
	var css_debug = path.join(workingDir, '\\**\\*.css');

	return gulp.src([js_debug, js_module, css_debug])
		.pipe(generateBundleJson())
		.pipe(gulp.dest('.'));
});


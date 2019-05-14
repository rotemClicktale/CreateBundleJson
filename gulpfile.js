const gulp = require('gulp'),
	util = require('gulp-util'),
	path = require('path'),
	bundle = require('./generateBundleJson.js'),// plugin for generating bundleconfig.json file 
	filterFiles = require('./filterFiles.js'),// plugin for filtering files with regex inside pipe line.
	jshintStylish = require('jshint-stylish'),//js and css linter reporter
	jshint = require('gulp-jshint'), //js and css linter
	//csslint = require('gulp-csslint'),
	//csslintStylish = require('csslint-stylish'),
	gulpStylelint = require('gulp-stylelint'),
	filter = require('gulp-filter'),
	through2 = require('through2');

// working directory should be where the csproj file exist!
let workingDir = util.env.path && util.env.path.replace ? util.env.path.replace(/"'"/g, '') : null;
workingDir = workingDir && workingDir.replace ? workingDir.replace(/'/g, '') : null;

const projectName = function () {
	var projectName = "uknown";
	try { projectName = path.parse(workingDir).name; }
	catch (e) { }
	return projectName;
}();


const lint = util.env.lint ? true : false; //TODO put if on pipe line if you want to use linter

console.log(`working on ${workingDir}`);

gulp.task('default', function () {
	if (!workingDir) throw 'Working path not defined!';

	var js_module = path.join(workingDir, '\\**\\*.jsmodule');
	var js_debug = path.join(workingDir, '\\**\\*.js');
	var css_debug = path.join(workingDir, '\\**\\*.css');

	var filterFilesRegex = {
		//pattern: '(?:(?<JSModule>[.]jsmodule)|(?<JSDebug>[^-]+[-]debug[.]js)|(?<StyleDebug>style-debug[.]css))$',
		pattern: '(?:(?<JSModule>[.]jsmodule)|(?<JSDebug>[^-]+[-]debug[.]js)|(?<StyleDebug>.+-debug[.]css))$',
		flag: 'g' //globaly search, (won`t stop on first find).
	}

	const jsFilter = filter(['**/*.js'], { restore: true });
	const cssFilter = filter(['**/*.css'], { restore: true });

	const jshintFailure = through2.obj(function (file, enc, next) {
		var isError = ((file.jshint) && (file.jshint.results) && (file.jshint.results.length > 0) && (file.jshint.results[0].error.code) && (file.jshint.results[0].error.code[0] === 'E'));
		if (isError) throw 'Generating bundleconfig.json failed cause of javascript error';
		this.push(file);
		next();
	});

	return gulp.src([js_debug, js_module, css_debug])
		.pipe(filterFiles(filterFilesRegex)) //filter files from pipe line
		.pipe(bundle.getRawFiles(filterFilesRegex)) //unbundle css and js files to pure js,css stream pipe line
		.pipe(through2.obj(function (file, enc, next) {
			this.push(file);
			next();
		}))
		.pipe(jsFilter)
		.pipe(jshint({ //process js and css linter 
			maxerr: 100,//http://jshint.com/docs/options/#maxerr
			yui: true, //http://jshint.com/docs/options/#yui
			asi: true, //http://jshint.com/docs/options/#asi,
			lastsemic: true	//http://jshint.com/docs/options/#lastsemic		
		}))
		.pipe(jshint.reporter(jshintStylish)) //report any errors and warnings linter found
		.pipe(jshintFailure) //if errors (not warnings) were found please fail the all process/
		.pipe(jsFilter.restore)
		.pipe(cssFilter)
		.pipe(gulpStylelint({
			failAfterError: false,
			reportOutputDir: `reports/lint/${projectName}/${Date.now()}`,
			reporters: [
				{ formatter: 'verbose', console: true },
				{ formatter: 'json', save: 'report.json' },
				{ formatter: 'string', save: 'report.txt' }
			],
			fix: true,
			debug: true,
			console: true
		}))
		.pipe(gulp.dest('src'))
		.pipe(cssFilter.restore)
		.pipe(bundle.generateBundleJson()) //if no errors in js and css generate bundleconfig.json file
		.pipe(gulp.dest(workingDir)); //put the json file inside the working directory
});


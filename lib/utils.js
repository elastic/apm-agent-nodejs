var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var module_cache;
module.exports.getModules = function getModules() {
    if(module_cache) {
        return module_cache;
    }

    module_cache = {};
    require.main.paths.forEach(function(path_dir) {
        if (!(fs.existsSync || path.existsSync)(path_dir)) {
            return;
        }

        var modules = fs.readdirSync(path_dir).filter(function(name) {
            return name.charAt(0) !== '.';
        });

        modules.forEach(function(module) {
            var pkg_json = path.join(path_dir, module, 'package.json');

            try {
                var json = require(pkg_json);
                module_cache[json.name] = json.version;
            } catch(e) {}
        });
    });

    return module_cache;
};


var LINES_OF_CONTEXT = 7;

function getFunction(line) {
    return line.getFunctionName() ||
           line.getTypeName() + '.' + (line.getMethodName() || '<anonymous>');
}

function parseStack(stack, cb) {
    var frames = [],
        cache = {},
        callbacks = stack.length;

    stack.forEach(function(line, index) {
        var frame = {
            filename: line.getFileName() || '',
            lineno: line.getLineNumber(),
            'function': getFunction(line)
        }, isInternal = line.isNative() ||
                        (frame.filename[0] !== '/' &&
                         frame.filename[0] !== '.');

        // in_app is all that's not an internal Node function or a module within node_modules
        frame.in_app = !isInternal && !~frame.filename.indexOf('node_modules/');

        // internal Node files are not full path names. Ignore them.
        if (isInternal) {
            frames[index] = frame;
            if (--callbacks === 0) cb(frames);
            return;
        }

        if (frame.filename in cache) {
            parseLines(cache[frame.filename]);
            if (--callbcaks === 0) cb(frames);
            return;
        }

        fs.readFile(frame.filename, function(err, file) {
            if (!err) {
                file = file.toString().split('\n');
                cache[frame.filename] = file;
                parseLines(file, frame);
            }
            frames[index] = frame;
            if (--callbacks === 0) cb(frames);
        });

        function parseLines(lines) {
            frame.pre_context = lines.slice(Math.max(0, frame.lineno-(LINES_OF_CONTEXT+1)), frame.lineno-1);
            frame.context_line = lines[frame.lineno-1];
            frame.post_context = lines.slice(frame.lineno, frame.lineno+LINES_OF_CONTEXT);
        }

        // console.log(line.getThis());
        // console.log(line.getTypeName());
        // console.log(line.getFunction().caller);
        // console.log(line.getFunction()+'');
        // console.log(line.getFunctionName());
        // console.log(line.getMethodName());
        // console.log(line.getFileName());
        // console.log(line.getLineNumber());
        // console.log(line.getColumnNumber());
        // console.log(line.getEvalOrigin());
        // console.log(line.isToplevel());
        // console.log(line.isNative());
        // console.log(line.isConstructor());
    });
}

module.exports.parseStack = parseStack;

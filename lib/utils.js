var fs = require('fs');

var LINES_OF_CONTEXT = 7;

var getFunction = function (line) {
    return line.getFunctionName() ||
           line.getTypeName() + '.' + (line.getMethodName() || '<anonymous>');
};

var parseStack = function (stack, cb) {
    var frames = [],
        cache = {},
        callbacks = stack.length;

    stack.forEach(function (line, index) {
        var frame = {
            filename   : line.getFileName() || '',
            lineno     : line.getLineNumber(),
            'function' : getFunction(line)
        };
        var isInternal = line.isNative() ||
                         (frame.filename[0] !== '/' &&
                          frame.filename[0] !== '.');
        var parseLines = function (lines) {
            frame.pre_context = lines.slice(Math.max(0, frame.lineno-(LINES_OF_CONTEXT+1)), frame.lineno-1);
            frame.context_line = lines[frame.lineno-1];
            frame.post_context = lines.slice(frame.lineno, frame.lineno+LINES_OF_CONTEXT);
        }

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

        fs.readFile(frame.filename, function (err, file) {
            if (!err) {
                file = file.toString().split('\n');
                cache[frame.filename] = file;
                parseLines(file, frame);
            }
            frames[index] = frame;
            if (--callbacks === 0) cb(frames);
        });

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
};

module.exports.parseStack = parseStack;

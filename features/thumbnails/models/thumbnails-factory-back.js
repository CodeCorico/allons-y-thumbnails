'use strict';

module.exports = function() {

  DependencyInjection.factory('thumbnailsFactory', function() {

    var sharp = require('sharp'),
        path = require('path'),
        fs = require('fs'),
        async = require('async');

    function _calcSize(file, size, callback) {
      sharp(path.join(file.path, file.file)).metadata(function(err, metadata) {
        if (err) {
          return callback(err);
        }

        if (size.width && size.width > 0) {
          metadata.height = size.width * metadata.height / metadata.width;
        }
        else if (size.height && size.height > 0) {
          metadata.width = size.height * metadata.width / metadata.height;
        }

        size.width = metadata.width;
        size.height = metadata.height;

        if (size.maxWidth && size.maxWidth > 0 && size.width > size.maxWidth) {
          size.height = Math.round(size.maxWidth * size.height / size.width);
          size.width = size.maxWidth;
        }
        if (size.maxHeight && size.maxHeight > 0 && size.height > size.maxHeight) {
          size.width = Math.round(size.maxHeight * size.width / size.height);
          size.height = size.maxHeight;
        }

        return callback(null, size);
      });
    }

    function _resize(options, filePath, file, outputExt, size, callback, exists) {
      var newFile = filePath + '-' + size.width + 'x' + size.height + '.' + (size.rounded ? 'png' : outputExt);

      if (!options.overwrite && exists !== false) {
        fs.lstat(path.join(size.path || file.path, newFile), function(err) {
          if (err) {
            _resize(options, filePath, file, outputExt, size, callback, false);
          }
          else {
            size.result = newFile;
            size.overwrite = false;

            callback();
          }
        });

        return;
      }

      var sizePath = path.join(size.path || file.path, newFile),
          instance = sharp(path.join(file.path, file.file)).resize(size.width, size.height);

      if (size.rounded) {
        instance.overlayWith(new Buffer([
          '<svg>',
            '<rect x="0" y="0" ',
              'width="', size.width, '" height="' + size.height + '" ',
              'rx="' + (size.width / 2) + '" ry="' + (size.height / 2) + '"',
            '/>',
          '</svg>'
        ].join('')), {
          cutout: true
        });
      }

      instance.toFile(sizePath, function(err) {
        if (err) {
          size.err = err;
        }
        else {
          size.result = newFile;
        }

        callback();
      });
    }

    return function thumbnailsFactory(files, options, callback) {
      files = Array.isArray(files) ? files : [files];

      options = options || {};
      options.overwrite = typeof options.overwrite == 'boolean' ? options.overwrite : false;
      options.resizeGif = typeof options.resizeGif == 'boolean' ? options.resizeGif : true;

      async.mapSeries(files, function(file, nextFile) {
        var filePath = file.file.split('.'),
            ext = filePath.pop();

        filePath = filePath.join('.');

        if (!filePath || !ext) {
          return nextFile();
        }

        var extLower = ext.toLowerCase(),
            outputExt = extLower == 'gif' ? 'png' : ext;

        async.mapSeries(file.sizes, function(size, nextSize) {
          if (!options.resizeGif && extLower == 'gif') {
            size.result = file.file;

            return nextSize();
          }

          if ((!size.width || !size.height) && (size.maxWidth || size.maxHeight)) {
            _calcSize(file, size, function(err) {
              if (err) {
                size.err = err;

                return nextSize();
              }

              _resize(options, filePath, file, outputExt, size, nextSize);
            });

            return;
          }

          _resize(options, filePath, file, outputExt, size, nextSize);
        }, function() {
          nextFile();
        });

      }, function() {
        callback(null, files);
      });
    };
  });
};

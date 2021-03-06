'use strict';

const co = require('co');
const fs = require('fs');
const path = require('path');
const denodeify = require('denodeify');
const rimraf = denodeify(require('rimraf'));
const cpr = denodeify(require('cpr'));
const lstat = denodeify(fs.lstat);
const readdir = denodeify(fs.readdir);
const rmdir = denodeify(fs.rmdir);

const _move = co.wrap(function* move(src, dest, options = {}, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  try {
    let {
      overwrite,
      merge,
      purge,
      filter = () => true
    } = options;

    if (!(yield Promise.resolve(filter(src, dest)))) {
      return;
    }

    let destStats;

    try {
      destStats = yield lstat(dest);
    } catch (err) {}

    if (destStats && !overwrite && !merge) {
      throw new Error('Destination directory already exists');
    }

    let srcStats = yield lstat(src);

    let areBothDirs = destStats && srcStats.isDirectory() && destStats.isDirectory();

    // pre

    if (overwrite && (!areBothDirs || !merge)) {
      yield rimraf(dest);

      destStats = null;
    }

    // during

    if (!destStats) {
      try {
        yield denodeify(fs.rename)(src, dest);
      } catch (err) {
        if (err.code === 'EXDEV') {
          yield cpr(src, dest);

          yield rimraf(src);
        }
      }
    }

    if (merge && areBothDirs) {
      for (let file of yield readdir(src)) {
        yield _move(
          path.join(src, file),
          path.join(dest, file),
          options
        );
      }
    }

    // post

    if (purge) {
      yield rimraf(src);
    } else {
      try {
        yield rmdir(src);
      } catch (err) {}
    }

    if (callback) {
      callback(null);
    }
  } catch (err) {
    if (!callback) {
      throw err;
    }

    callback(err);
  }
});

module.exports = _move;

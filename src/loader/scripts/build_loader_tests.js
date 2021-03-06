#!/usr/bin/env node

var fs = require('fs'),
    path = require('path'),
    mods = {};

var json = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'js') + '/yui3.json'));

var wrapper = fs.readFileSync(__dirname + '/loader_template.js', 'utf8');

var testMod = function(v) {
    //Removes YUI core modules
    //if ((v.indexOf('yui') === -1) && (v.indexOf('loader') === -1) && (v.indexOf('history') === -1)) {
    if ((v.indexOf('yui') === -1) && (v.indexOf('loader') === -1) && (v.indexOf('css') === -1) && (v !== 'queue-run')) {
        return true;
    }
    return false;
}

Object.keys(json).forEach(function(v) {
    if (testMod(v)) { //Removes YUI core modules
        mods[v] = json[v];
        if (json[v].submodules) {
            Object.keys(json[v].submodules).forEach(function(k) {
                if (testMod(k)) { //Removes YUI core modules
                    mods[k] = json[v].submodules[k];
                }
            });
        }
    }
});

var writeTest = function(key, mod) {
    var str = '     "Testing ' + key + '": function(data) {\n';
    str += '            var loader = new Y.Loader({\n';
    str += '                require: ["' + key + '"],\n';
    str += '                allowRollup: false\n';
    str += '            });\n';
    str += '            loader.calculate();\n';
    if (mod.use) {
        str += '            //Testing A rollup module\n';
        mod.use.forEach(function(s) {
            str += '            Assert.isTrue((loader.sorted.indexOf("' + s + '")) > -1);\n';
        });
    } else {
        str += '            //Testing A normal module\n';
        str += '            Assert.isTrue((loader.sorted.indexOf("' + key + '")) > -1);\n';
    }
    str += '        }';
    return str;
};

var tests = [];

Object.keys(mods).forEach(function(k) {
    tests.push(writeTest(k, mods[k]));
});

var str = '{\n';
str += '    name: "Loader Tests",\n';
str += '    ' + tests.join(',\n'),
str += '    \n}';

wrapper = wrapper.replace('!!TESTCASE!!', str);

fs.writeFileSync(path.join(__dirname, '../', 'tests/cli') + '/loader.js', wrapper);
console.log(Object.keys(mods).length + ' tests written to: ./tests/cli/loader.js');

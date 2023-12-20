
import { readFileSync, writeFileSync } from 'fs';

export function exportUml(path, filename) {

    var plantuml = require('node-plantuml');
    var fs = require('fs');

    var gen = plantuml.generate('"'+filename+'"');
    gen.out.pipe(fs.createWriteStream(path+"arithmetics.png"));
}

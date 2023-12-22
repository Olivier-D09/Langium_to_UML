/******************************************************************************
 * Copyright 2023 Université Cote d'Azur
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/

import { readFileSync, writeFileSync} from 'fs';
import { join } from 'path';

export function exportUml(path, filename) { // ne fonctionnne pas, probablement un problème de chemin d'accès
    var plantuml = require('node-plantuml');
    var fs = require('fs');

    var gen = plantuml.generate(join(path, filename));
    gen.out.pipe(fs.createWriteStream(path+"arithmetics.png"));
}

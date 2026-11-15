const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..');
const limits=Object.freeze({mae:8,allInsideMAE:8,outsideMAE:6,rimMAE:12,centreMAE:8,ssim:.92});
const scenes=['grid','type','grid-tiers','type-tiers'];
const sourceFiles=['apps/desktop/public/index.html','apps/desktop/public/lxmine/material.js','apps/desktop/public/lxmine/style.css','apps/desktop/public/lxmine/app.js','apps/desktop/public/lxmine/pagination.js','apps/desktop/public/lxmine/popup-motion.js'];
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const hashes=files=>Object.fromEntries(files.map(file=>[file,sha(file)]));
const passes=m=>m.mae<=limits.mae&&m.allInsideMAE<=limits.allInsideMAE&&m.outsideMAE<=limits.outsideMAE&&m.rimMAE<=limits.rimMAE&&m.centreMAE<=limits.centreMAE&&m.ssim>=limits.ssim;
module.exports={root,limits,sourceFiles,sha,hashes,passes,scenes};

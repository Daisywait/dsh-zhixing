import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {readArchive,commit,validateArchive} from '../scripts/store.mjs';

export const emptyArchive=()=>({schemaVersion:1,revision:0,updatedAt:null,topics:[]});
export function dataRoot(){return resolve(process.env.DSH_ZHIXING_HOME||join(process.env.DSH_HOME||join(homedir(),'.dsh'),'storages','zhixing'));}
export async function initialize(root){
  await mkdir(join(root,'data'),{recursive:true});
  try{await writeFile(join(root,'data/archive.json'),JSON.stringify(emptyArchive(),null,2)+'\n',{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
  return readArchive(root);
}
export async function archiveAction(root,action,operation){
  if(action==='read')return readArchive(root);
  if(action==='apply')return commit(root,JSON.parse(operation));
  throw new Error('Unknown action');
}
export {readArchive,validateArchive};

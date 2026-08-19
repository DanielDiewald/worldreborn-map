import "server-only";

import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE=0x06054b50;
const CENTRAL_SIGNATURE=0x02014b50;
const LOCAL_SIGNATURE=0x04034b50;
const MAX_ARCHIVE_BYTES=256*1024*1024;
const MAX_ENTRIES=256;
const MAX_ENTRY_BYTES=64*1024*1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES=512*1024*1024;

export type ZipEntry={
  name:string;
  flags:number;
  method:number;
  compressedSize:number;
  uncompressedSize:number;
  localHeaderOffset:number;
  directory:boolean;
};

function findEndOfCentralDirectory(buffer:Buffer){
  const min=Math.max(0,buffer.length-0xffff-22);
  for(let offset=buffer.length-22;offset>=min;offset-=1){
    if(buffer.readUInt32LE(offset)===EOCD_SIGNATURE)return offset;
  }
  throw new Error("Ungültige ZIP-Datei: Central Directory wurde nicht gefunden.");
}

function decodeName(bytes:Buffer){
  // Rock 3 exports use ASCII/UTF-8 names. UTF-8 is also a safe fallback for the
  // legacy ZIP code page because all preset matching names are ASCII-compatible.
  return bytes.toString("utf8").replace(/\\/g,"/");
}

export function listZipEntries(buffer:Buffer):ZipEntry[]{
  if(buffer.length===0)throw new Error("Die ZIP-Datei ist leer.");
  if(buffer.length>MAX_ARCHIVE_BYTES)throw new Error(`ZIP-Datei ist zu groß. Maximum: ${Math.floor(MAX_ARCHIVE_BYTES/1024/1024)} MB.`);
  const eocd=findEndOfCentralDirectory(buffer);
  const entryCount=buffer.readUInt16LE(eocd+10);
  const centralSize=buffer.readUInt32LE(eocd+12);
  const centralOffset=buffer.readUInt32LE(eocd+16);
  if(entryCount===0xffff||centralSize===0xffffffff||centralOffset===0xffffffff)throw new Error("ZIP64-Archive werden für den Rock-3-Import derzeit nicht unterstützt.");
  if(entryCount>MAX_ENTRIES)throw new Error(`ZIP enthält zu viele Einträge. Maximum: ${MAX_ENTRIES}.`);
  if(centralOffset+centralSize>buffer.length)throw new Error("Ungültige ZIP-Datei: Central Directory liegt außerhalb der Datei.");

  const entries:ZipEntry[]=[];let cursor=centralOffset,totalUncompressed=0;
  for(let index=0;index<entryCount;index+=1){
    if(cursor+46>buffer.length||buffer.readUInt32LE(cursor)!==CENTRAL_SIGNATURE)throw new Error("Ungültige ZIP-Datei: fehlerhafter Central-Directory-Eintrag.");
    const flags=buffer.readUInt16LE(cursor+8),method=buffer.readUInt16LE(cursor+10);
    const compressedSize=buffer.readUInt32LE(cursor+20),uncompressedSize=buffer.readUInt32LE(cursor+24);
    const nameLength=buffer.readUInt16LE(cursor+28),extraLength=buffer.readUInt16LE(cursor+30),commentLength=buffer.readUInt16LE(cursor+32);
    const localHeaderOffset=buffer.readUInt32LE(cursor+42);
    if(compressedSize===0xffffffff||uncompressedSize===0xffffffff||localHeaderOffset===0xffffffff)throw new Error("ZIP64-Einträge werden für den Rock-3-Import derzeit nicht unterstützt.");
    const nameStart=cursor+46,nameEnd=nameStart+nameLength;
    if(nameEnd>buffer.length)throw new Error("Ungültige ZIP-Datei: Dateiname liegt außerhalb der Datei.");
    const name=decodeName(buffer.subarray(nameStart,nameEnd));
    const directory=name.endsWith("/");
    if(!directory){
      if(uncompressedSize>MAX_ENTRY_BYTES)throw new Error(`ZIP-Eintrag ist zu groß: ${name}`);
      totalUncompressed+=uncompressedSize;
      if(totalUncompressed>MAX_TOTAL_UNCOMPRESSED_BYTES)throw new Error("ZIP-Inhalt ist entpackt zu groß.");
    }
    entries.push({name,flags,method,compressedSize,uncompressedSize,localHeaderOffset,directory});
    cursor=nameEnd+extraLength+commentLength;
  }
  return entries;
}

export function extractZipEntry(buffer:Buffer,entry:ZipEntry){
  if(entry.directory)return Buffer.alloc(0);
  if(entry.flags&0x1)throw new Error(`Verschlüsselte ZIP-Einträge werden nicht unterstützt: ${entry.name}`);
  if(entry.localHeaderOffset+30>buffer.length||buffer.readUInt32LE(entry.localHeaderOffset)!==LOCAL_SIGNATURE)throw new Error(`Ungültiger ZIP-Eintrag: ${entry.name}`);
  const nameLength=buffer.readUInt16LE(entry.localHeaderOffset+26),extraLength=buffer.readUInt16LE(entry.localHeaderOffset+28);
  const dataStart=entry.localHeaderOffset+30+nameLength+extraLength,dataEnd=dataStart+entry.compressedSize;
  if(dataEnd>buffer.length)throw new Error(`ZIP-Eintrag ist abgeschnitten: ${entry.name}`);
  const compressed=buffer.subarray(dataStart,dataEnd);
  let output:Buffer;
  if(entry.method===0)output=Buffer.from(compressed);
  else if(entry.method===8)output=inflateRawSync(compressed,{maxOutputLength:MAX_ENTRY_BYTES});
  else throw new Error(`Nicht unterstützte ZIP-Kompression (${entry.method}) bei ${entry.name}.`);
  if(output.length!==entry.uncompressedSize)throw new Error(`ZIP-Eintrag hat eine unerwartete Größe: ${entry.name}`);
  return output;
}

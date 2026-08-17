import "server-only";

const MAX_BYTES = Number.parseInt(process.env.MEDIA_MAX_BYTES ?? String(10 * 1024 * 1024), 10);
const MAX_DIMENSION = Number.parseInt(process.env.MEDIA_MAX_DIMENSION ?? "20000", 10);
const MAX_PIXELS = Number.parseInt(process.env.MEDIA_MAX_PIXELS ?? "100000000", 10);

export type ValidatedImage = { mimeType: "image/jpeg"|"image/png"|"image/webp"|"image/gif"; extension: "jpg"|"png"|"webp"|"gif"; width:number; height:number };

function dimensionsPng(buffer:Buffer){if(buffer.length<24)return null;return{width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20)};}
function dimensionsGif(buffer:Buffer){if(buffer.length<10)return null;return{width:buffer.readUInt16LE(6),height:buffer.readUInt16LE(8)};}
function dimensionsJpeg(buffer:Buffer){let offset=2;while(offset+9<buffer.length){if(buffer[offset]!==0xff){offset+=1;continue;}const marker=buffer[offset+1];if(marker===0xd8||marker===0xd9){offset+=2;continue;}if(offset+4>buffer.length)return null;const length=buffer.readUInt16BE(offset+2);if(length<2||offset+2+length>buffer.length)return null;if((marker>=0xc0&&marker<=0xc3)||(marker>=0xc5&&marker<=0xc7)||(marker>=0xc9&&marker<=0xcb)||(marker>=0xcd&&marker<=0xcf)){if(length<7)return null;return{height:buffer.readUInt16BE(offset+5),width:buffer.readUInt16BE(offset+7)};}offset+=2+length;}return null;}
function dimensionsWebp(buffer:Buffer){if(buffer.length<30)return null;const chunk=buffer.toString("ascii",12,16);if(chunk==="VP8X"){return{width:1+buffer.readUIntLE(24,3),height:1+buffer.readUIntLE(27,3)};}if(chunk==="VP8 "){for(let i=20;i+9<buffer.length&&i<40;i++){if(buffer[i]===0x9d&&buffer[i+1]===0x01&&buffer[i+2]===0x2a){return{width:buffer.readUInt16LE(i+3)&0x3fff,height:buffer.readUInt16LE(i+5)&0x3fff};}}}if(chunk==="VP8L"&&buffer.length>=25){const b0=buffer[21],b1=buffer[22],b2=buffer[23],b3=buffer[24];return{width:1+(((b2&0x3f)<<8)|b1),height:1+((b3<<6)|(b2>>6)|((b0&0)==1?0:0))};}return null;}

export function validateImageBuffer(buffer:Buffer):ValidatedImage{
 if(buffer.length===0)throw new Error("Die Datei ist leer.");if(buffer.length>MAX_BYTES)throw new Error(`Bild ist zu groß. Maximum: ${Math.floor(MAX_BYTES/1024/1024)} MB.`);
 let type:Omit<ValidatedImage,"width"|"height">|null=null;let dimensions:{width:number;height:number}|null=null;
 if(buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))){type={mimeType:"image/png",extension:"png"};dimensions=dimensionsPng(buffer);}
 else if(buffer.length>=3&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff){type={mimeType:"image/jpeg",extension:"jpg"};dimensions=dimensionsJpeg(buffer);}
 else if(buffer.length>=12&&buffer.toString("ascii",0,4)==="RIFF"&&buffer.toString("ascii",8,12)==="WEBP"){type={mimeType:"image/webp",extension:"webp"};dimensions=dimensionsWebp(buffer);}
 else if(buffer.length>=6&&(buffer.toString("ascii",0,6)==="GIF87a"||buffer.toString("ascii",0,6)==="GIF89a")){type={mimeType:"image/gif",extension:"gif"};dimensions=dimensionsGif(buffer);}
 if(!type)throw new Error("Nicht unterstützter oder ungültiger Bildinhalt. Erlaubt: JPEG, PNG, WEBP, GIF.");
 if(!dimensions||dimensions.width<=0||dimensions.height<=0)throw new Error("Bilddimensionen konnten nicht sicher gelesen werden.");
 if(dimensions.width>MAX_DIMENSION||dimensions.height>MAX_DIMENSION||dimensions.width*dimensions.height>MAX_PIXELS)throw new Error("Bilddimensionen überschreiten das Sicherheitslimit.");
 return{...type,...dimensions};
}

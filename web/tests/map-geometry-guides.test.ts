import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLandMaskGuide,
  conformPolygonToLandMask,
  conformPolygonToParent,
  geometryContainsCoordinate,
  mapCoordinateToMaskPixel,
} from "../src/components/map/map-geometry-guides";

function grayscaleMask(width:number,height:number,land:(x:number,y:number)=>boolean){
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y+=1){for(let x=0;x<width;x+=1){const value=land(x,y)?255:0;const offset=(y*width+x)*4;data[offset]=value;data[offset+1]=value;data[offset+2]=value;data[offset+3]=255;}}
  return data;
}

function outerRing(geometry:{type:string;coordinates:unknown}){
  assert.equal(geometry.type,"Polygon");
  assert.ok(Array.isArray(geometry.coordinates));
  const polygon=geometry.coordinates as number[][][];
  return polygon[0];
}

test("country coastline is pulled back from water to the land-mask boundary",()=>{
  const width=20,height=12;
  const guide=buildLandMaskGuide(grayscaleMask(width,height,(x)=>x>=5&&x<=14),width,height,[0,0,20,12]);
  const country={type:"Polygon",coordinates:[[[3,2],[17,2],[17,10],[3,10],[3,2]]]};
  const conformed=conformPolygonToLandMask(country,guide,2);
  const ring=outerRing(conformed);
  assert.ok(ring.length>5,"coastline should be densified");
  for(const coordinate of ring){
    const pixel=mapCoordinateToMaskPixel(guide,[coordinate[0],coordinate[1]]);
    assert.ok(pixel[0]>=3.5&&pixel[0]<=15.5,"water points should be pulled to the nearest coastline");
  }
});

test("province points outside the parent polygon are constrained to its boundary",()=>{
  const parent={type:"Polygon",coordinates:[[[2,2],[8,2],[8,8],[2,8],[2,2]]]};
  const province={type:"Polygon",coordinates:[[[5,4],[11,4],[11,7],[5,7],[5,4]]]};
  const conformed=conformPolygonToParent(province,parent,0.5);
  const ring=outerRing(conformed);
  assert.ok(ring.length>5);
  for(const coordinate of ring)assert.equal(geometryContainsCoordinate(parent,[coordinate[0],coordinate[1]])||Math.abs(coordinate[0]-8)<1e-6,true);
  assert.ok(ring.every((coordinate)=>coordinate[0]<=8.000001),"province must not extend beyond the parent east border");
});

test("points already inside a parent political polygon stay inside",()=>{
  const parent={type:"Polygon",coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]]]};
  const province={type:"Polygon",coordinates:[[[2,2],[6,2],[6,6],[2,6],[2,2]]]};
  const conformed=conformPolygonToParent(province,parent,1);
  for(const coordinate of outerRing(conformed))assert.equal(geometryContainsCoordinate(parent,[coordinate[0],coordinate[1]]),true);
});

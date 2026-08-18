import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { layoutFamilyTree } from "../src/lib/family-tree-layout";

function fixture(size:number){
  const people=Array.from({length:size},(_,index)=>({personId:index+1,name:`Person ${String(index+1).padStart(4,"0")}`}));
  const edges:Array<{a:number;b:number;code:string;directed:boolean}>=[];
  for(let child=2;child<=size;child+=1){
    const parent=Math.max(1,Math.floor(child/2));
    edges.push({a:parent,b:child,code:"parent",directed:true});
    if(child%11===0&&child+1<=size)edges.push({a:child,b:child+1,code:"sibling",directed:false});
  }
  const mainLine:number[]=[];let current=1;
  while(current<=size){mainLine.push(current);current*=2;}
  return{people,edges,mainLine};
}

for(const size of [50,200,500]){
  test(`family tree layout benchmark ${size} nodes`,()=>{
    const {people,edges,mainLine}=fixture(size);const visible=new Set(people.map((person)=>person.personId));
    const start=performance.now();const layout=layoutFamilyTree(people,edges,visible,mainLine);const duration=performance.now()-start;
    console.log(`[perf] family-tree full ${size} nodes: ${duration.toFixed(2)} ms, ${edges.length} edges, ${layout.width}x${layout.height}`);
    assert.equal(layout.positions.size,size);
    assert.ok(Number.isFinite(layout.width)&&Number.isFinite(layout.height));
    assert.ok(duration<10_000,`layout exceeded 10s safety budget: ${duration.toFixed(2)}ms`);
  });
}

test("collapsed family tree computes layout only for visible nodes",()=>{
  const {people,edges,mainLine}=fixture(500);const visibleIds=new Set<number>(mainLine);
  for(let id=1;id<=24;id+=1)visibleIds.add(id);
  const visiblePeople=people.filter((person)=>visibleIds.has(person.personId));const visibleEdges=edges.filter((edge)=>visibleIds.has(edge.a)&&visibleIds.has(edge.b));
  const start=performance.now();const layout=layoutFamilyTree(visiblePeople,visibleEdges,visibleIds,mainLine.filter((id)=>visibleIds.has(id)));const duration=performance.now()-start;
  console.log(`[perf] family-tree collapsed 500->${visiblePeople.length} visible nodes: ${duration.toFixed(2)} ms, ${visibleEdges.length} visible edges`);
  assert.equal(layout.positions.size,visiblePeople.length);
  assert.ok(visiblePeople.length<50);
});

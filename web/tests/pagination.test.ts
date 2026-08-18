import assert from "node:assert/strict";
import test from "node:test";
import { clampPagination, paginatedResult, parsePagination } from "../src/lib/pagination";

test("parsePagination uses safe defaults and allowed page sizes",()=>{
  assert.deepEqual(parsePagination({}),{page:1,pageSize:25,limit:25,offset:0});
  assert.deepEqual(parsePagination({page:"3",pageSize:"50"}),{page:3,pageSize:50,limit:50,offset:100});
  assert.deepEqual(parsePagination({page:"-2",pageSize:"999"}),{page:1,pageSize:25,limit:25,offset:0});
});

test("clampPagination keeps requests on an existing stable page",()=>{
  const parsed=parsePagination({page:"99",pageSize:"10"});
  assert.deepEqual(clampPagination(27,parsed),{page:3,pageSize:10,limit:10,offset:20});
});

test("paginatedResult reports total pages without slicing client-side",()=>{
  const pagination=parsePagination({page:"2",pageSize:"25"});
  const result=paginatedResult(["row"],51,pagination);
  assert.equal(result.total,51);
  assert.equal(result.page,2);
  assert.equal(result.pageSize,25);
  assert.equal(result.totalPages,3);
  assert.deepEqual(result.items,["row"]);
});

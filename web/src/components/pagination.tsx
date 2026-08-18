import Link from "next/link";
import { PAGE_SIZES, type PageSize } from "@/lib/pagination";
import styles from "./pagination.module.css";

function hrefFor(args:{pathname:string;searchParams?:Record<string,string|undefined>;page:number;pageSize:PageSize;pageParam:string;pageSizeParam:string}){
  const query=new URLSearchParams();
  for(const [key,value] of Object.entries(args.searchParams??{})){
    if(value&&key!==args.pageParam&&key!==args.pageSizeParam)query.set(key,value);
  }
  query.set(args.pageParam,String(args.page));
  query.set(args.pageSizeParam,String(args.pageSize));
  return `${args.pathname}?${query.toString()}`;
}

export function Pagination({pathname,searchParams,page,pageSize,total,totalPages,pageParam="page",pageSizeParam="pageSize"}:{pathname:string;searchParams?:Record<string,string|undefined>;page:number;pageSize:PageSize;total:number;totalPages:number;pageParam?:string;pageSizeParam?:string}){
  if(total===0)return null;
  const candidates=new Set([1,totalPages,page-2,page-1,page,page+1,page+2].filter((value)=>value>=1&&value<=totalPages));
  const pages=[...candidates].sort((a,b)=>a-b);
  return <div className={styles.bar}>
    <div className={styles.summary}><strong>{total}</strong> Einträge · Seite {page} von {totalPages}</div>
    <div className={styles.pages}>
      <Link className={`button ghost ${page<=1?styles.disabled:""}`} aria-disabled={page<=1} href={hrefFor({pathname,searchParams,page:Math.max(1,page-1),pageSize,pageParam,pageSizeParam})}>←</Link>
      {pages.map((value,index)=>{
        const previous=pages[index-1];
        return <span key={value} className={styles.wrap}>{previous&&value-previous>1?<span className={styles.ellipsis}>…</span>:null}<Link className={`button ghost ${styles.page} ${value===page?styles.active:""}`} href={hrefFor({pathname,searchParams,page:value,pageSize,pageParam,pageSizeParam})}>{value}</Link></span>;
      })}
      <Link className={`button ghost ${page>=totalPages?styles.disabled:""}`} aria-disabled={page>=totalPages} href={hrefFor({pathname,searchParams,page:Math.min(totalPages,page+1),pageSize,pageParam,pageSizeParam})}>→</Link>
    </div>
    <div className={styles.size}>{PAGE_SIZES.map((size)=><Link key={size} className={size===pageSize?styles.sizeActive:""} href={hrefFor({pathname,searchParams,page:1,pageSize:size,pageParam,pageSizeParam})}>{size}</Link>)}</div>
  </div>;
}

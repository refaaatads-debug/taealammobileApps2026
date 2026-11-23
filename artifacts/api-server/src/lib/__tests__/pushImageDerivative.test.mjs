import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp,readFile,readdir,rm,writeFile,utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { encodePushImage,prepareAdminPushImage,readPreparedPushImage,MAX_PUSH_IMAGE_BYTES } from "../pushImageDerivative.ts";
import { buildPlatformNotification } from "../pushOutbox.ts";
const url = "https://ajyalalmaerifa.com/storage/v1/object/public/site-assets/notifications/test.JPG";
const image = () => sharp({create:{width:3000,height:4000,channels:3,background:"#268e7b"}}).jpeg().toBuffer();
async function withCache(fn) {const dir=await mkdtemp(path.join(os.tmpdir(),"push-image-test-"));try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}

test("large JPEG becomes bounded JPEG and original remains byte-identical", async()=>{
 const input=await image(); const before=Buffer.from(input); const output=await encodePushImage(input,"image/jpeg");
 assert.deepEqual(input,before);assert.ok(output.length<=MAX_PUSH_IMAGE_BYTES);
 const info=await sharp(output).metadata();assert.equal(info.format,"jpeg");assert.ok(info.width<=960&&info.height<=960);
});
test("PNG and WebP become JPEG",async()=>{
 for (const format of ["png","webp"]) {
 const input=await sharp({create:{width:1500,height:1000,channels:4,background:{r:255,g:0,b:0,alpha:0.5}}})[format]().toBuffer();
 const output=await encodePushImage(input,`image/${format}`);assert.equal((await sharp(output).metadata()).format,"jpeg");
 }
});
test("invalid MIME, mismatched magic and excessive source bytes are rejected",async()=>{
 await assert.rejects(()=>encodePushImage(Buffer.from("not an image"),"image/jpeg"));
 await assert.rejects(()=>encodePushImage(Buffer.alloc(5_000_001),"image/jpeg"));
 await assert.rejects(()=>encodePushImage(awaitablePng,"image/jpeg"));
});
const awaitablePng=Buffer.from([137,80,78,71,13,10,26,10]);
test("prepare caches small image, route reads JPEG, payload uses derivative not original",async()=>withCache(async cacheDir=>{
 const input=await image();let calls=0;
 const fetcher=async()=>{calls++;return new Response(input,{headers:{"content-type":"image/jpeg"}})};
 const derived=await prepareAdminPushImage(url,{cacheDir,fetcher});assert.match(derived,/^https:\/\/api\.ajyalalmaerifa\.com\/api\/push-images\/[a-f0-9]{64}\.jpg$/);
 assert.equal(await prepareAdminPushImage(url,{cacheDir,fetcher}),derived);assert.equal(calls,1);
 const bytes=await readPreparedPushImage(derived.split("/").at(-1),cacheDir);assert.ok(bytes?.length<=MAX_PUSH_IMAGE_BYTES);
 const notification=buildPlatformNotification("platform-notification:test",{notificationId:"test",recipientId:"user",title:"Test",body:"Body",type:"admin_broadcast",imageUrl:derived});
 assert.equal(notification.notification.richContent.image,derived);assert.equal(notification.notification.data.imageUrl,derived);
 assert.ok(!JSON.stringify(notification).includes(url));
 assert.equal(await readPreparedPushImage("../other.jpg",cacheDir),null);
}));
test("untrusted URL never fetched; oversized, invalid MIME, errors fall back to no image",async()=>withCache(async cacheDir=>{
 let calls=0;const fetcher=async()=>{calls++;throw new Error("network")};
 assert.equal(await prepareAdminPushImage(url.replace("https:","http:"),{cacheDir,fetcher}),null);assert.equal(calls,0);
 assert.equal(await prepareAdminPushImage(url,{cacheDir,fetcher}),null);
 assert.equal(await prepareAdminPushImage(url,{cacheDir,fetcher:async()=>new Response("x",{headers:{"content-type":"image/jpeg","content-length":"5000001"}})}),null);
 assert.equal(await prepareAdminPushImage(url,{cacheDir,fetcher:async()=>new Response("x",{headers:{"content-type":"text/html"}})}),null);
 assert.equal(await prepareAdminPushImage(url,{cacheDir,fetcher:async()=>new Response("x",{status:404})}),null);
}));
test("stream byte cap without Content-Length is enforced",async()=>withCache(async cacheDir=>{
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(5_000_001));controller.close();}});
 assert.equal(await prepareAdminPushImage(url,{cacheDir,fetcher:async()=>new Response(stream,{headers:{"content-type":"image/jpeg"}})}),null);
}));
test("concurrent same-source requests share one fetch",async()=>withCache(async cacheDir=>{
 const input=await image();let count=0;const fetcher=async()=>{count++;await new Promise(r=>setTimeout(r,20));return new Response(input,{headers:{"content-type":"image/jpeg"}})};
 const urls=await Promise.all([prepareAdminPushImage(url,{cacheDir,fetcher}),prepareAdminPushImage(url,{cacheDir,fetcher})]);assert.equal(urls[0],urls[1]);assert.equal(count,1);
}));
test("high-entropy JPEG stays within hard byte and dimension cap",async()=>{
 const raw=Buffer.alloc(1800*2400*3);let seed=7;for(let i=0;i<raw.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;raw[i]=seed>>>24;}
 const input=await sharp(raw,{raw:{width:1800,height:2400,channels:3}}).jpeg({quality:95}).toBuffer();
 assert.ok(input.length>1_000_000);const output=await encodePushImage(input,"image/jpeg");assert.ok(output.length<=MAX_PUSH_IMAGE_BYTES);const info=await sharp(output).metadata();assert.ok(info.width<=960&&info.height<=960);
});
test("decompression-bomb pixel dimensions are rejected",async()=>{
 const input=await sharp({create:{width:7000,height:7000,channels:3,background:"#fff"}}).png().toBuffer();
 await assert.rejects(()=>encodePushImage(input,"image/png"));
});
test("EXIF orientation is applied and metadata stripped",async()=>{
 const input=await sharp({create:{width:1200,height:600,channels:3,background:"#99aabb"}}).jpeg().withMetadata({orientation:6}).toBuffer();
 const output=await encodePushImage(input,"image/jpeg");const info=await sharp(output).metadata();assert.equal(info.width,480);assert.equal(info.height,960);assert.equal(info.orientation,undefined);assert.equal(info.exif,undefined);
});
test("expired cache is not served",async()=>withCache(async cacheDir=>{
 const input=await image();const derived=await prepareAdminPushImage(url,{cacheDir,fetcher:async()=>new Response(input,{headers:{"content-type":"image/jpeg"}})});
 const name=derived.split("/").at(-1);const old=new Date(Date.now()-8*24*3600_000);await utimes(path.join(cacheDir,name),old,old);assert.equal(await readPreparedPushImage(name,cacheDir),null);
}));
test("image HTTP route serves JPEG without auth, invalid key returns 404",async()=>withCache(async cacheDir=>{
 const express=(await import("express")).default;const router=(await import("../../routes/pushImages.ts")).default;
 process.env.PUSH_IMAGE_CACHE_DIR=cacheDir;
 const derived=await prepareAdminPushImage(url,{cacheDir,fetcher:async()=>new Response(await image(),{headers:{"content-type":"image/jpeg"}})});
 const app=express();app.use("/api",router);const server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.on("listening",resolve));
 try{const origin=`http://127.0.0.1:${server.address().port}`;const res=await fetch(origin+new URL(derived).pathname);assert.equal(res.status,200);assert.match(res.headers.get("content-type"),/image\/jpeg/);assert.ok((await res.arrayBuffer()).byteLength<=300_000);assert.equal((await fetch(origin+"/api/push-images/not-a-key.jpg")).status,404);}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));delete process.env.PUSH_IMAGE_CACHE_DIR;}
}));

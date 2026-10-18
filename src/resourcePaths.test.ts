import { expect, it } from "vitest";
import type { Resource } from "./types";
import { resourceDirectory } from "./resourcePaths";
const roots: Resource[] = [{id:"course",name:"工程伦理",course:"工程伦理",kind:"course",children:[{id:"category",name:"电子课件",course:"工程伦理",kind:"folder",children:[{id:"chapter",name:"第一单元",course:"工程伦理",kind:"folder",children:[{id:"file",name:"讲义.pdf",course:"工程伦理",kind:"file",children:[]}]}]}]}];
it("多文件下载保存课程、分类和全部父目录，文件名单独保存",()=>{
  expect(resourceDirectory(roots,"file")).toEqual(["工程伦理","电子课件","第一单元"]);
  expect(resourceDirectory(roots,"chapter")).toEqual(["工程伦理","电子课件","第一单元"]);
});

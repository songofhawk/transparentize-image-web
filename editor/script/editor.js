/**
 * 图片转透明背景示例
 * @author 宋辉
 * @license MIT协议，可以任意复制，编辑，但需保留版权信息
 */

 // canvas上绘制图片
var srcImg = document.getElementById('src-image');
var targetImg =  document.getElementById('trt-image');
var targetCanvas = document.getElementById('editor-canvas');
srcImg.onload = function () {
    let result = {};
    //读取源图数据,变透明后绘制到目标图中
    toTransparentCanvas(srcImg,targetCanvas, result);
    //读取源图数据,变透明后覆盖源图
    // toTransparent(srcImg, srcImg, result);

    if (result.bgColor){
        document.getElementById('color-btn').value = result.bgColor;
    }
};
srcImg.src = './image/logo.jpg';

var fileSelector = document.getElementById('file-btn');
fileSelector.addEventListener('change', function(){
    var curFiles = this.files;
    if (curFiles.length===0){
        return;
    }
    var curFile = curFiles[0];
    srcImg.src = window.URL.createObjectURL(curFile);
});


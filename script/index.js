/**
 * 图片转透明背景示例
 * @author 宋辉
 * @license MIT协议，可以任意复制，编辑，但需保留版权信息
 */

// 背景转透明
var srcImg = document.getElementById('src-image');
var targetImg =  document.getElementById('tgt-image');
srcImg.onload = function () {
    let result = {};
    //读取源图数据,变透明后绘制到目标图中
    toTransparentImage(srcImg,targetImg, result);
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

// 抠图替换色块
const matting_srcImg = document.getElementById('cutout-src-image');
const matting_targetCanvas =  document.getElementById('cutout-tgt-image');
const fullCanvas =  document.getElementById('full-canvas');
let canvasImage;

matting_srcImg.onload = function () {
    canvasImage = new CanvasImage(matting_srcImg, matting_targetCanvas, fullCanvas);
    canvasImage.mouseZoomEnable();
    // canvasImage.pickColorByMouse(function(point){
    //     document.getElementById('cutout-color-btn').value = point.hexColor;
    //     canvasImage.matting(point);
    // });

    // const canvas = imageToCanvas(matting_srcImg, matting_targetCanvas);
    // canvas.toBlob(function(blob) {
    //     originBlobUrl = URL.createObjectURL(blob);
    // });

    //constcanvas.getImageData();
    // ctx = canvas.getContext('2d');
    // width = canvas.width;
    // height = canvas.height;
    // const srcImgArray = ctx.getImageData(0, 0, width, height).data;
    
};
matting_srcImg.src = './image/bag.png';
// pickColorByMouse(matting_targetCanvas, function(point){
//     document.getElementById('cutout-color-btn').value = point.color;
//     const srcImgArray = ctx.getImageData(0, 0, width, height).data;
//     canvasImage = new CanvasImage(srcImgArray, width, height);
//     let labelArray = canvasImage.matting(point);
//     changePixelByLabel(matting_targetCanvas, labelArray);
// });


const smoothCheck = document.getElementById('smooth-check');
smoothCheck.addEventListener('change', function () {
    canvasImage.setSmooth(this.checked);
});

//选文件
const cutout_fileSelector = document.getElementById('cutout-file-btn');
cutout_fileSelector.addEventListener('change', function(){
    var curFiles = this.files;
    if (curFiles.length===0){
        return;
    }
    var curFile = curFiles[0];
    matting_srcImg.src = window.URL.createObjectURL(curFile);
    smoothCheck.checked = true;
});



const pickColorBtn = document.getElementById('pick-color-btn');
const colorSpan = document.getElementById('color-span');
pickColorBtn.addEventListener('click', function() {
    const coloring = new ImageEditToolColoring(canvasImage);
    coloring.onClick = function(point) {
        colorSpan.style.backgroundColor = point.hexColor;
    };
    canvasImage.setEditTool(coloring);
});

// 点击按钮缩放
// let zoomBtn = document.getElementById('zoom-btn');
// let zoomInput = document.getElementById('zoom-input');
// zoomBtn.addEventListener('click', function(){
//         let scale = parseFloat(zoomInput.value);
//         canvasImage.zoomRender(scale);
// });


/**
 * 测试用SVG平铺图片
 */
// function makeSVG(tag, attrs) {
//     const ns = 'http://www.w3.org/2000/svg';
//     const xlinkns = 'http://www.w3.org/1999/xlink';
//
//     let el= document.createElementNS(ns, tag);
//     if (tag==='svg'){
//         el.setAttribute('xmlns:xlink', xlinkns);
//     }
//     for (let k in attrs) {
//         if (k === 'xlink:href') {
//             el.setAttributeNS(xlinkns, k, attrs[k]);
//         } else {
//             el.setAttribute(k, attrs[k]);
//         }
//     }
//     return el;
// }
//
// window.addEventListener('load', function(){
//     const svgtest = document.getElementById('svg-test');
//     let svg = makeSVG('svg');
//     svg.style.width='100%';
//     svg.style.height='100%';
//     let defs = makeSVG('defs');
//     let pattern = makeSVG('pattern', {id:'polka-dots',x:'0',y:'0',width:'100',height:'100',patternUnits:'userSpaceOnUse'});
//     let image = makeSVG('image',{'xlink:href':'./image/face.png', width:'50', height: '50', x:'0', y:'0'});
//     let rect = makeSVG('rect',{x:'0',y:'0',width:'100%',height:'100%',fill:'url(#polka-dots)'});
//     // image.onload = function(){
//     // };
//     defs.appendChild(pattern);
//     pattern.appendChild(image);
//     svg.appendChild(defs);
//     svg.appendChild(rect);
//     svgtest.appendChild(svg);
// });

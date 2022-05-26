/**
 * 将指定图片转为透明背景工具方法
 * @author 宋辉
 * @description 代码实现参考了张鑫旭的文章和demo http://www.zhangxinxu.com/wordpress/?p=7510
 * @license MIT协议，可以任意复制，编辑，但需保留版权信息
 */

 (function (){

    window.toTransparentDataUrl=function(srcImage, result) {
        let targetCanvas = toTransparentCanvas(srcImage, null, result);
        if (targetCanvas===null){
            return null;
        }
        return  targetCanvas.toDataURL("image/png");
    }

    window.toTransparentImage=function(srcImage, targetImage, result) {
        let data = toTransparentDataUrl(srcImage, result);
        if (data===null){
            if (targetImage && targetImage!==srcImage){
                targetImage.src=result.dataUrl;
            }
            return null;
        }
        if (!targetImage){
            targetImage = new Image();
        }
        targetImage.src = data;
        return targetImage;
    }

    /**
     * 将给定Image对象所引用的图片,转换为背景透明的canvas返回
     * @param {Image} srcImage 源图像元素
     * @param {Element} targetCanvas 目标画布,用于保存转换后的图片. 如果传了这个参数,那么结果将展现在指定画布上; 如果不传这个参数, 那么函数会创建一个canvas对象,并返回
     * @returns 变为背景透明的图像canvas; 如果源图像就是背景透明的,那么返回null.
     */
    window.toTransparentCanvas=function(srcImage, targetCanvas, result) {
        //背景色误差容忍度
        const tolerance = 10;
        //获取图像size
        let width = srcImage.naturalWidth, height = srcImage.naturalHeight;

        //源canvas, 用于获取图像数据
        let sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = width;
        sourceCanvas.height = height;
        //将图像内容绘制到源canvas,并获得数据
        let sourceContext = sourceCanvas.getContext('2d');
        sourceContext.drawImage(srcImage, 0, 0);
        //获取像素数据
        let srcImageData = sourceContext.getImageData(0, 0, width, height)
        let srcImgDataArray = srcImageData.data;
        let length = srcImgDataArray.length;
        //推测可能的背景色
        let possibleBgColor = getPosibleBgColor(srcImageData);
        if (result){
            result.bgColor = colorToHex(possibleBgColor);
        }
        //定义结果像素数据
        let trtImgDataArray = new Uint8ClampedArray(length);
        //将接近背景色的像素都置为全透明,其他的取源像素值
        //但如果本来就有透明像素存在, 就不再处理, 直接返回false
        for (var i = 0; i < length; i += 4) {
            let r = srcImgDataArray[i];
            let g = srcImgDataArray[i + 1];
            let b = srcImgDataArray[i + 2];
            let a = srcImgDataArray[i + 3];
            if (a!=255){
                result.dataUrl = sourceCanvas.toDataURL("image/png");
                return null;
            }

            let diffR = r - possibleBgColor.r;
            let diffG = g - possibleBgColor.g;
            let diffB = b - possibleBgColor.b;

            if ( Math.sqrt(
                diffR*diffR + diffG*diffG + diffB*diffB
                ) <= tolerance )
            {
                trtImgDataArray[i] = 0;
                trtImgDataArray[i+1]=0;
                trtImgDataArray[i+2]=0;
                trtImgDataArray[i+3]=0;
            } else {
                trtImgDataArray[i] = r;
                trtImgDataArray[i+1]=g;
                trtImgDataArray[i+2]=b;
                trtImgDataArray[i+3]=a;
            }
        }
        //获取/生成目标画布
        if (!targetCanvas){
            targetCanvas = document.createElement("canvas");
        }
        targetCanvas.width = width;
        targetCanvas.height = height;
        //绘制目标画布
        let targetContext = targetCanvas.getContext('2d');
        let targetImageData = new ImageData(trtImgDataArray, width, height);
        targetContext.putImageData(targetImageData, 0, 0 );
        if (result){
            result.imageData = targetImageData;
            result.canvas = targetCanvas;
        }
        //返回目标画布
        return targetCanvas;
    }

    function numToHex(number){
        let hex = number.toString(16);
        return (hex.length < 2) ? '0' + hex : hex;
    }

    function colorToHex(color){
        return '#'+ numToHex(color.r) + numToHex(color.g) + numToHex(color.b);
    }

    /**
     * 一个存储颜色出现次数的数据结构
     */
    function Frequency(){};
    /**
     * 把颜色存入,如果已经存在,计数+1
     */
    Frequency.prototype.put = function(r,g,b){
        if (this[r]===undefined){
            this[r]={};
            this[r][g]={};
            this[r][g][b]=1;
        }else if (this[r][g]===undefined){
            this[r][g]={};
            this[r][g][b]=1;
        }else if (this[r][g][b]===undefined){
            this[r][g][b]=1;
        }else{
            this[r][g][b] += 1;
        }
    };
    /**
     * 获取数据结构中最频繁出现的颜色
     */
    Frequency.prototype.getMostRgb = function(){
        let most = 0;
        let rIndex,gIndex,bIndex;
        for (let r in this) {
            let ro = this[r];
            for (let g in ro) {
                let rgo = ro[g];
                for (let b in rgo) {
                    if (most<rgo[b]){
                        most=rgo[b];
                        rIndex = r;
                        gIndex = g;
                        bIndex = b;
                    }
                }
            }
        }
        return {r:parseInt(rIndex), g:parseInt(gIndex), b:parseInt(bIndex)};
    };

    /**
     * 获取图片数据中最有可能的背景颜色
     * @param {ImageData} imgData 这个是canvas.getImageData()获取的数据结构,应该有width,height和data三个属性
     */
    function getPosibleBgColor(imgData){
        //定义一个统计频次的对象
        let frequency = new Frequency();

        let dataArray = imgData.data;
        let width = imgData.width, height = imgData.height;
        let length = dataArray.length;
        //统计第一行
        for (let i = 0; i < width*4; i+=4) {
            frequency.put(dataArray[i], dataArray[i+1], dataArray[i+2]);
        }
        //统计最后一行
        let lastLineStart = width*4*(height -1);
        for (let i = lastLineStart; i < length; i+=4) {
            frequency.put(dataArray[i], dataArray[i+1], dataArray[i+2]);
        }
        //统计第一列(除去首行和末行)
        for (let i = width*4; i < lastLineStart; i+=width*4) {
            frequency.put(dataArray[i], dataArray[i+1], dataArray[i+2]);
        }
        //统计最后一列(除去首行和末行)
        for (let i = width*4*2 - 4; i < length - width*4; i+=width*4) {
            frequency.put(dataArray[i], dataArray[i+1], dataArray[i+2]);
        }
        return frequency.getMostRgb();
    }

})();

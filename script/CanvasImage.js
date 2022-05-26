function CanvasImage(srcImage, targetCanvas, fullCanvas) {

    this.imageToCanvas(srcImage, targetCanvas, fullCanvas);
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;
    this.clientWidth = this.canvas.clientWidth;
    this.clientHeight = this.canvas.clientHeight;

    this.renderRect = {x: 0, y: 0, width: width, height: height, scale: 1,
        cache : function () {
            this.cacheX = this.x;
            this.cacheY = this.y;
        },
        clearCache : function(){
            this.cacheX = null;
            this.cacheY = null;
        }
    };
    //原始图像数据
    this.originImgArray = ctx.getImageData(0, 0, width, height).data;

    //颜色差值容忍度(小于这个值, 就认为是相同的颜色)
    this.TOLERANCE = 15;
    //颜色变化差值容忍度(小于这个值, 就认为变化不大, 或者说变化很慢)
    this.A_TOLERANCE = 2;
    //最大颜色差值容忍度(即使颜色变化小于A_TOLERANCE, 总的差值大于这个值也不能接受)
    this.MAX_TOLERANCE = 50;

    // 当前图像数据(canvs可能会缩放,平移,造成图像数据改变)rgb版
    this.rgbImgArray = this.originImgArray;
    // 缺省缩放比
    this.scale = 1;
    //编辑模式:
    //pick-color:取色
    //pan: 平移
    //matting: 抠图
    this.setEditTool(new ImageEditToolMatting(this));
    // 编辑历史
    this.dataHistory = createStack();
}

function ImageEditToolMatting(canvasImage) {
    this.ci = canvasImage;
    this.cursor = 'url(./cursor/fedora/crosshair.cur), crosshair';
    this.onClick = null;
}

ImageEditToolMatting.prototype._click = function (point) {
    console.log("ImageEditToolMatting onClick");
    const ci = this.ci;
    ci.matting(point);
    if (this.onClick) {
        this.onClick(point);
    }
};

function ImageEditToolColoring(canvasImage) {
    this.ci = canvasImage;
    this.cursor = 'url(./cursor/fedora/color-picker.cur), default';
    this.onClick = null;
}

ImageEditToolColoring.prototype._click = function (point) {
    console.log("ImageEditToolColoring onClick");
    const ci = this.ci;
    const c = ci.getRenderColor(point.x, point.y);
    point.c = c;
    point.hexColor = colorToHex(c);
    if (this.onClick) {
        this.onClick(point);
    }
};

CanvasImage.prototype.setEditTool = function (tool) {
    this._editTool = tool;
    this.changeCursor(tool.cursor);

    /**
     * 只有第一次调用的时候,需要绑定事件, 以后每次只要更换EditTool对象就好了
     */
    if (this._editToolEnabled) {
        return;
    }
    const self = this;
    this.canvas.addEventListener("click", function (event) {
        if (self.preventClick) {
            self.preventClick = false;
            return;
        }
        //getMousePos(canvas, event);
        const mouseX = event.offsetX;
        const mouseY = event.offsetY;
        const rect = self.renderRect;
        //这个地方用Math.round, 取出来的点总会比实际偏下一点, 用floor正好
        const offsetX = Math.floor(mouseX * rect.width / this.offsetWidth);
        const offsetY = Math.floor(mouseY * rect.height / this.offsetHeight);
        const x = rect.x + offsetX;
        const y = rect.y + offsetY;
        let point = {
            x: x,
            y: y
        };
        self._editTool._click(point);
    });
    this._editToolEnabled = true;

};

CanvasImage.prototype.pushData = function (imgDataArray) {
    this.dataHistory.push(imgDataArray);
};

CanvasImage.prototype.undo = function () {
    const imgArray = this.dataHistory.pop();
    if (imgArray) {
        this.drawData(imgArray);
        this.render();
    }
};

CanvasImage.prototype.changeCursor = function (curStr) {
    this._currentCuror = curStr;
    this.canvas.style.cursor = curStr;
};

/**
 * 以指定点为起点, 实现抠图
 * @param {Object} point 起始点,指定x,y坐标
 *
 */
CanvasImage.prototype.matting = function (point) {
    this.pushData(this.rgbImgArray);
    let startPoint = new CanvasPoint(point, {
        width: this.width,
        height: this.height,
    });
    const labelArray = this.seedFilling(startPoint);
    this.changePixelByLabel(labelArray);
    return labelArray;
};

/**
 * 以指定CanvasPoint为启动, 实现种子填充算法
 * @param {CanvasPoint} startPoint
 * @returns {Uint8Array} 标识了填充像素的数组
 */
CanvasImage.prototype.seedFilling = function (startPoint) {
    const self = this;

    const stack = createStack();
    //生成标识数组 (图像数组用4个元素保存一个像素点, 标识数组用1个元素标识就可以, 所以长度要除以4)
    const labelArray = new Uint8Array(this.originImgArray.length / 4);
    labelArray[startPoint.i]=1;

    function meanColorInSlidingWin(p) {
        let meanColor = new Uint8Array(3);
        let totalAvaiInWin = 0;
        p.traverseSlidingWin(function (x, y, i) {
            if (i === p.i || labelArray[i] === 1) {
                totalAvaiInWin++;
                const c = self.hslColor(i);

                meanColor[0] += c[0];
                meanColor[1] += c[1];
                meanColor[2] += c[2];
                // meanColor += c; 数组加法
            }
        });
        meanColor[0] /= totalAvaiInWin;
        meanColor[1] /= totalAvaiInWin;
        meanColor[2] /= totalAvaiInWin;
        return meanColor;
    }


    const startIndex = startPoint.i;
    //起点颜色值,都按照
    const startColor = this.hslColor(startIndex);

    /**
     * 计算给定像素点的颜色值和起点颜色值之差
     * @param {int} index
     */
    function colorDiffToStart(index) {
        const hslColor = self.hslColor(index);
        return hslColorArrayDifference(hslColor,
            startColor);
    }

    let p = startPoint;

    console.time('种子填充');
    let totalCount = 1;
    let aCount = 1;
    while (true) {
        p.seekAdjPoints(function (x, y, i) {
            let available = false;
            let cDiffToStart;

            if (labelArray[i] === 0) {
                cDiffToStart = colorDiffToStart(i);
                if (cDiffToStart < self.TOLERANCE) {
                    available = true;
                } else {
                    const c = self.hslColor(i);
                    let meanColor = meanColorInSlidingWin(p);
                    const cDiffToWin = hslColorArrayDifference(c, meanColor);
                    available = cDiffToWin < self.A_TOLERANCE && cDiffToStart < self.MAX_TOLERANCE;
                }
            } else {
                available = false;
            }
            if (available && i!==p.i) {
                stack.push(new CanvasPoint({x: x, y: y, i: i, src: p}, p.image));
                labelArray[i] = 1;
                aCount++;
            }
        });
        p = stack.pop();
        // lable(p);
        // labelArray[canvasPoint.i] = -1;
        totalCount++;
        if (totalCount%10000===0) {
            console.log("matter:", totalCount);
        }
        if (totalCount>1200000){
            break;
        }
        if (stack.isEmpty()) {
            break;
        }
    }

    console.timeEnd('种子填充');
    console.log("搜寻像素数:%d, 有效像素数:%d", totalCount, aCount);

    return labelArray;
};

CanvasImage.prototype.color = function (index) {
    let i = index * 4;
    let c = new Uint8Array(4);
    let imgArray = this.rgbImgArray;
    c[0] = imgArray[i];
    c[1] = imgArray[i + 1];
    c[2] = imgArray[i + 2];
    c[3] = imgArray[i + 3];
    return c;
};

CanvasImage.prototype.hslColor = function (index) {
    let i = index * 4;
    let c = new Uint8Array(4);
    let imgArray = this.hslImgArray ? this.hslImgArray : this.hslImgArray = rgbArrayToHsl(this.rgbImgArray);
    c[0] = imgArray[i];
    c[1] = imgArray[i + 1];
    c[2] = imgArray[i + 2];
    c[3] = imgArray[i + 3];
    return c;
};


// CanvasImage.prototype.colorChangeSlowly = function (colorDifference, prePoint) {
//     if (this.A_TOLERANCE <= 0) {
//         return false;
//     }
//     let a = Math.abs(colorDifference - prePoint.cDif) - (prePoint.cDif - prePoint.src.cDif);
//     if (a < this.A_TOLERANCE) {
//         return true;
//     } else {
//         return false;
//     }
// }

/**
 * 将给定Image对象所引用的图片,转换为背景透明的canvas返回
 * @param {Image} srcImage 源图像元素
 * @param {Canvas} targetCanvas 目标画布,用于保存转换后的图片. 如果传了这个参数,那么结果将展现在指定画布上; 如果不传这个参数, 那么函数会创建一个canvas对象,并返回
 * @param {Canvas} fullCanvas 中间画布,用于保存整个图像. 通常不用传这个参数,仅为调试需要, 展示中间结果.
 * @returns {Canvas} 变为背景透明的图像canvas; 如果源图像就是背景透明的,那么返回null.
 */
CanvasImage.prototype.imageToCanvas = function (srcImage, targetCanvas, fullCanvas) {
    //获取图像ze
    const width = this.width = srcImage.naturalWidth, height = this.height = srcImage.naturalHeight;

    fullCanvas = this.fullCanvas = fullCanvas == null ? document.createElement("canvas") : fullCanvas;
    fullCanvas.width = width;
    fullCanvas.height = height;
    //将图像内容绘制到源canvas,并获得数据
    const fullCtx = this.fullCtx = fullCanvas.getContext('2d');
    fullCtx.clearRect(0, 0, width, height);
    fullCtx.drawImage(srcImage, 0, 0);

    //源canvas, 用于获取图像数据
    targetCanvas = this.canvas = targetCanvas == null ? document.createElement("canvas") : targetCanvas;
    targetCanvas.width = width;
    targetCanvas.height = height;
    //将图像内容绘制到源canvas,并获得数据
    const ctx = this.ctx = targetCanvas.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(srcImage, 0, 0);

    return targetCanvas;
};

// CanvasImage.prototype.pickColorByMouse = function (callback) {
//     const self = this;
//     this.canvas.addEventListener("click", function (event) {
//         //getMousePos(canvas, event);
//         const mouseX = event.offsetX;
//         const mouseY = event.offsetY;
//         const rect = self.renderRect;
//         const offsetX = Math.round(mouseX * rect.width / this.offsetWidth);
//         const offsetY = Math.round(mouseY * rect.height / this.offsetHeight);
//         const x = rect.x + offsetX;
//         const y = rect.y + offsetY;
//
//         const c = self.getRenderColor(x, y);
//         // const c = ctx.getImageData(x, y, 1, 1).data;
//         console.log("color: " + c);
//         let point = {
//             hexColor: colorToHex(c),
//             x: x,
//             y: y,
//             c: c
//         };
//         if (callback) {
//             callback(point);
//         }
//     });
// };

CanvasImage.prototype.mouseZoomEnable = function () {
    const self = this;
    const ele = this.canvas;
    ele.addEventListener("mousewheel", function (e) {
        // var _log = "",
        //  _ie9 = navigator.userAgent.indexOf("MSIE 9.0") > 0,
        //  _h = _ie9 ? window.innerHeight : document.body.clientHeight;  //兼容IE9

        // _log += "deltaY:" + e.deltaY;
        // _log += "|wheelDelta:" + e.wheelDelta;
        // _log += "|detail:" + e.detail;
        // _log += "|H:" + _h;
        // console.log("[mouse scroll]: "+_log)

        if (e.deltaY !== 0 && e.ctrlKey) {
            self.zoomRender(self.scale * (e.deltaY < 0 ? 1.1 : 0.9), {x: e.offsetX, y: e.offsetY});
            e.stopPropagation();
            e.preventDefault();
        }
    });

    let willZoom = false;
    let willDrag = false;
    const zoomCursor = 'zoom-in';
    ele.addEventListener("keydown", function (e) {
        if (e.ctrlKey && !willZoom) {
            // console.log("keydown to zoom");
            willZoom = true;
            ele.style.cursor = zoomCursor;
        }
    }, true);

    ele.addEventListener("keyup", function (e) {
        if (willZoom) {
            // console.log("keyup cancel zoom");
            willZoom = false;
            ele.style.cursor = self._currentCuror;
        }
    }, true);

    ele.addEventListener('mousedown', function (e) {
        if (willZoom) {
            ele.style.cursor = 'grabbing';
            self.startDrag(e.clientX, e.clientY, e);
            e.stopPropagation();
            e.preventDefault();
            willDrag = true;
        }
    });

    ele.addEventListener('mouseup', function (e) {
        if (willZoom) {
            ele.style.cursor = zoomCursor;
            self.endDrag(e.clientX, e.clientY, e);
            e.stopPropagation();
            e.preventDefault();
            willDrag = false;
        }
    });

    ele.addEventListener('mousemove', function (e) {
        if (willDrag) {
            self.dragMove(e.clientX, e.clientY, e);
            e.stopPropagation();
            e.preventDefault();
        }
    });

    ele.addEventListener("keypress", function (e) {
        if (e.ctrlKey && e.keyCode === 26) {
            self.undo();
        }
    }, true);
    ele.focus();
};

CanvasImage.prototype.startDrag = function (mouseX, mouseY, e) {
    this.initDragX = mouseX;
    this.initDragY = mouseY;
    this.renderRect.cache();
    // this.startDragRectX = this.renderRect.x;
    // this.startDragRectY = this.renderRect.y;
    this.preventClick = true;
};


CanvasImage.prototype.dragMove = function (mouseX, mouseY, e) {
    const moveX = mouseX - this.initDragX;
    const moveY = mouseY - this.initDragY;
    this.moveRender(moveX, moveY);
};


CanvasImage.prototype.endDrag = function (initX, initY, e) {
    this.initDragX = null;
    this.initDragY = null;
    this.renderRect.clearCache();
    // this.startDragRectX = null;
    // this.startDragRectY = null;
};


CanvasImage.prototype.changePixelByLabel = function (labelArray) {
    //获取源数据
    // const rgbImageData = ctx.getImageData(0, 0, width, height);
    // const rgbImgArray = rgbImageData.data;
    const rgbImgArray = this.rgbImgArray;
    const length = rgbImgArray.length;
    //创建目标数据
    const tgtImgArray = new Uint8ClampedArray(length);

    //根据标志位来填充目标数据
    for (let i = 0; i < rgbImgArray.length; i += 4) {
        let r = rgbImgArray[i];
        let g = rgbImgArray[i + 1];
        let b = rgbImgArray[i + 2];
        let a = rgbImgArray[i + 3];
        if (labelArray[i / 4] === 1) {
            tgtImgArray[i] = r;
            tgtImgArray[i + 1] = g;
            tgtImgArray[i + 2] = b;
            tgtImgArray[i + 3] = 0;
        } else {
            tgtImgArray[i] = r;
            tgtImgArray[i + 1] = g;
            tgtImgArray[i + 2] = b;
            tgtImgArray[i + 3] = a;
        }
    }
    this.drawData(tgtImgArray);
    this.render();
};

CanvasImage.prototype.getRenderColor = function (x, y) {
    const i = y * this.width + x;
    return this.color(i);
};


CanvasImage.prototype.drawData = function (imgArray) {
    this.rgbImgArray = imgArray;
    this.hslImgArray = null;
    const width = this.width;
    const height = this.height;
    const fullCtx = this.fullCtx;
    fullCtx.putImageData(new ImageData(imgArray, width, height), 0, 0);
};


CanvasImage.prototype.render = function () {
    const ctx = this.ctx;
    const rect = this.renderRect;
    const width = this.width;
    const height = this.height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(this.fullCanvas, rect.x, rect.y, rect.width, rect.height, 0, 0, width, height);
};


CanvasImage.prototype.zoom = function (scale, point) {
    this.scale = scale;
    const rect = this.renderRect;
    const width = this.width;
    const height = this.height;

    const ratioX = point.x / this.clientWidth;
    const ratioY = point.y / this.clientHeight;
    const oldTop = rect.y;
    const oldLeft = rect.x;
    const oldWidth = rect.width;
    const oldHeight = rect.height;

    const newWidth = Math.round(width / scale);
    const newHeight = Math.round(height / scale);

    const newLeft = Math.round(ratioX * (oldWidth - newWidth) + oldLeft);
    const newTop = Math.round(ratioY * (oldHeight - newHeight) + oldTop);

    rect.x = newLeft;
    rect.y = newTop;
    rect.width = newWidth;
    rect.height = newHeight;
};

CanvasImage.prototype.zoomRender = function (scale, point) {
    this.zoom(scale, point);
    this.render();
};

CanvasImage.prototype.move = function (moveX, moveY) {
    const rect = this.renderRect;
    if (rect.cacheX===undefined || rect.cacheX===null){
        return;
    }
    const ratioX = moveX / this.clientWidth;
    const ratioY = moveY / this.clientHeight;


    const left = rect.cacheX - ratioX*rect.width;
    const top = rect.cacheY - ratioY*rect.height;
    rect.x = Math.round(left);
    rect.y = Math.round(top);
};

CanvasImage.prototype.moveRender = function (moveX, moveY) {
    this.move(moveX, moveY);
    this.render();
};


CanvasImage.prototype.setSmooth = function (willSmooth) {
    this.ctx.imageSmoothingEnabled = willSmooth;
    this.render();
};

/**
 * 图像中的一个点
 * @param {*} point
 * @param {*} image
 */
function CanvasPoint(point, image) {
    // x坐标
    this.x = point.x;
    // y坐标
    this.y = point.y;
    // 在整个图像数组中第i个点(先行后列计数)
    this.i = point.i === undefined ? this.y * image.width + this.x : point.i;
    // 表示当前点是被哪个相邻点发现的(通过seekAdjPoints)
    this.src = point.src === undefined ? point : point.src;

    // 所在图像的信息
    this.image = image;
    //this.srcImgArray = image.srcImgArray;
}

CanvasPoint.prototype.seekAdjPoints = function (handler) {
    const x = this.x, y = this.y, i = this.i;
    const width = this.image.width, height = this.image.height;
    if (y > 0) { //上
        let newI = i - width;
        let newY = y - 1;
        handler(x, newY, newI);
    }
    if (x < width - 1) { //右
        let newI = i + 1;
        let newX = x + 1;
        handler(newX, y, newI);
    }
    if (y < height - 1) { //下
        let newI = i + width;
        let newY = y + 1;
        handler(x, newY, newI);
    }
    if (x > 0) { //左
        let newI = i - 1;
        let newX = x - 1;
        handler(newX, y, newI);
    }
};


CanvasPoint.prototype.traverseSlidingWin = function (handler) {
    const winSize = 4;
    const x = this.x, y = this.y;
    const width = this.image.width, height = this.image.height;
    const startX = x > winSize ? x - winSize : 0;
    const endX = x + winSize < width ? x + winSize : width;
    const startY = y > winSize ? y - winSize : 0;
    const endY = y + winSize < height ? y + winSize : height;
    for (let row = startY; row <= endY; row++) {
        for (let col = startX; col <= endX; col++) {
            handler(col, row, row * width + col);
        }
    }
};

/**
 * 获取两个坐标点的色差
 * @param {Uint8Array} imgArray 图像数据数组(每个点用4个元素存储, 分别表示rgba)
 * @param {int} i1 坐标点1在图像中的位置(换算成数组中的位置要乘以4)
 * @param {int} i2 坐标点2在图像中的位置(换算成数组中的位置要乘以4)
 */
function colorDiffrence(imgArray, i1, i2) {
    // 这是所谓LAB算法, 理论上更接近人眼感受的色差
    //     ————————————————
    // 版权声明：本文为CSDN博主「程序猿也可以很哲学」的原创文章，遵循 CC 4.0 BY-SA 版权协议，转载请附上原文出处链接及本声明。
    // 原文链接：https://blog.csdn.net/qq_16564093/article/details/80698479
    const ia1 = i1 * 4, ia2 = i2 * 4;
    const R_1 = imgArray[ia1];
    const G_1 = imgArray[ia1 + 1];
    const B_1 = imgArray[ia1 + 2];
    const R_2 = imgArray[ia2];
    const G_2 = imgArray[ia2 + 1];
    const B_2 = imgArray[ia2 + 2];
    const rmean = (R_1 + R_2) / 2;
    const R = R_1 - R_2;
    const G = G_1 - G_2;
    const B = B_1 - B_2;
    return Math.sqrt((2 + rmean / 256) * (R ** 2) + 4 * (G ** 2) + (2 + (255 - rmean) / 256) * (B ** 2));

    //     //这是最普通的色差算法, 就是计算RGB直角坐标系中的空间距离
    //     const ia1 = i1 * 4, ia2 = i2 * 4;
    //     R = imgArray[ia1] - imgArray[ia2];
    //     G = imgArray[ia1+1] - imgArray[ia2+1];
    //     B = imgArray[ia1+2] - imgArray[ia2+2];
    //     return Math.sqrt(R ** 2 + G ** 2 + B ** 2);
}

function hslDifference(h1, s1, l1, h2, s2, l2) {
    const H = h1 - h2;
    const S = s1 - s2;
    const L = l1 - l2;
    return Math.sqrt((H ** 2) * 0.4 + (S ** 2) * 0.4 + (L ** 2) * 0.2);
}

function hslColorArrayDifference(cArray1, cArray2) {
    const H = cArray1[0] - cArray2[0];
    const S = cArray1[1] - cArray2[1];
    const L = cArray1[2] - cArray2[2];
    return Math.sqrt((H ** 2) * 0.4 + (S ** 2) * 0.4 + (L ** 2) * 0.2);
}

function hslDifferenceInImgArray(hslArray, i1, i2) {
    const ia1 = i1 * 4, ia2 = i2 * 4;
    const H = hslArray[ia1] - hslArray[ia2];
    const S = hslArray[ia1 + 1] - hslArray[ia2 + 1];
    const L = hslArray[ia1 + 2] - hslArray[ia2 + 2];

    return Math.sqrt((H ** 2) * 0.4 + (S ** 2) * 0.4 + (L ** 2) * 0.2);
}


/**
 * RGB 颜色值转换为 HSL.
 * 转换公式参考自 http://en.wikipedia.org/wiki/HSL_color_space.
 * ref: http://uyi2.com/archiveDetail?id=3524&name=jsjs实现HSL与RGB色彩的相互转换功能
 * r, g, 和 b 需要在 [0, 255] 范围内
 * 返回的 h, s, 和 l 在 [0, 1] 之间
 *
 * @param   Number  r       红色色值
 * @param   Number  g       绿色色值
 * @param   Number  b       蓝色色值
 * @return  Array           HSL各值数组
 */
function rgbToHsl(r, g, b) {

    r /= 255, g /= 255, b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r:
                h = (g - b) / d + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / d + 2;
                break;
            case b:
                h = (r - g) / d + 4;
                break;
        }
        h /= 6;
    }
    return [Math.floor(h * 360), Math.floor(s * 100), Math.floor(l * 100)];
}

function rgbToHslInArray(rgbArray, hslArray, index) {
    let hsl = rgbToHsl(rgbArray[index], rgbArray[index + 1], rgbArray[index + 2]);
    hslArray[index] = hsl[0];
    hslArray[index + 1] = hsl[1];
    hslArray[index + 2] = hsl[2];
    hslArray[index + 3] = rgbArray[index + 3];
}

function rgbArrayToHsl(rgbArray) {
    const hslArray = new Uint8Array(rgbArray.length);
    for (let i = 0; i < rgbArray.length; i += 4) {
        rgbToHslInArray(rgbArray, hslArray, i);
    }
    return hslArray;
}


function numToHex(number) {
    let hex = number.toString(16);
    return (hex.length < 2) ? '0' + hex : hex;
}

function colorToHex(color) {
    if (typeof color[0] === "number") {
        return '#' + numToHex(color[0]) + numToHex(color[1]) + numToHex(color[2]);
    } else if (typeof color.r === "number") {
        return '#' + numToHex(color.r) + numToHex(color.g) + numToHex(color.b);
    }
}


function inverseTransparentCanvas(canvas) {
    let ctx = canvas.getContext('2d');
    let width = canvas.width;
    let height = canvas.height;
    //获取源数据
    let srcImageData = ctx.getImageData(0, 0, width, height);
    let srcImgArray = srcImageData.data;
    let length = srcImgArray.length;
    //创建目标数据
    let tgtImgArray = new Uint8ClampedArray(length);

    //根据标志位来填充目标数据
    for (let i = 0; i < srcImgArray.length; i += 4) {
        let r = srcImgArray[i];
        let g = srcImgArray[i + 1];
        let b = srcImgArray[i + 2];
        let a = srcImgArray[i + 3];

        tgtImgArray[i] = r;
        tgtImgArray[i + 1] = g;
        tgtImgArray[i + 2] = b;
        tgtImgArray[i + 3] = 255 - a;
    }
    //把目标数据写入到图像
    ctx.putImageData(new ImageData(tgtImgArray, width, height), 0, 0);
}

function inverseTransparentImage(srcImage) {
    let targetCanvas = imageToCanvas(srcImage);
    inversTransparentCanvas(targetCanvas);
    return targetCanvas.toDataURL('image/png');
}

function inverseTransparentDataUrl(dataUrl, callback) {
    let image = new Image();
    image.onload = function () {
        const inversedData = inverseTransparentImage(image);
        if (callback) {
            callback(inversedData);
        }
    }
    image.src = dataUrl;
}

function createStack() {
    let stack = [];
    // stack.pushMulti = function (list) {
    //     for (let i = 0; i < list.length; i++) {
    //         stack.push(list[i]);
    //     }
    // };
    stack.isEmpty = function () {
        //如果长度为0 ，则操作结果为false, 返回后，Y=false，X=!Y=true，说明 长度为0的数组为空对象
        //其它长度结果为 true，将结果返回后，Y=true, X=!Y=false，说明长度大于0的数组不属于空对象
        return !stack.length;
    };
    return stack;
}


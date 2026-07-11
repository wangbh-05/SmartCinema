/**
 * Cinema — Canvas 弧形影院绘图引擎 v6
 *
 * 布局：固定行高 + 仅水平弧线。白底浅色主题。
 * 热度图常驻：边框颜色表示热度（红=热门/琥珀=一般/蓝=冷门）。
 * 银幕光晕：从银幕曲线向下照射观众席。
 * 空座白色·选中琥珀·已售灰色·推荐淡紫。
 */
import { SEAT_STATUS, HALL_CONFIG } from './SeatData.js';

const CLR = {
    bg:'#FFFFFF', bgGrid:'rgba(0,0,0,0.04)', screen:'#3B82F6',
    avail:'#F9FAFB',availS:'#E5E7EB', select:'#F59E0B',selectS:'#D97706',
    sold:'#9CA3AF',soldS:'#6B7280', rec:'#8B5CF6',recS:'#7C3AED',
    rowLabel:'#6B7280',legend:'#4B5563',hallInfo:'#6B7280',dragLine:'#FBBF24',
    tooltipBg:'rgba(255,255,255,0.96)',tooltipBd:'#D1D5DB',tooltipTxt:'#1F2937',
};

// 色盲友好配色（蓝/橙调，对红绿色盲友好）
const CLR_CB = {
    bg:'#FFFFFF', bgGrid:'rgba(0,0,0,0.04)', screen:'#2563EB',
    avail:'#F0F4FF',availS:'#BFDBFE', select:'#F97316',selectS:'#EA580C',
    sold:'#78716C',soldS:'#57534E', rec:'#1D4ED8',recS:'#1E3A8A',
    rowLabel:'#6B7280',legend:'#4B5563',hallInfo:'#6B7280',dragLine:'#FBBF24',
    tooltipBg:'rgba(255,255,255,0.96)',tooltipBd:'#D1D5DB',tooltipTxt:'#1F2937',
};
const HEAT_CB = {
    hot:  {r:234, g:88,  b:12 },  // 深橙 — 热门区
    warm: {r:250, g:165, b:60 },  // 中等橙 — 一般区
    cold: {r:59,  g:130, b:246},  // 蓝 — 冷门区
};

// 热度光晕色值（供径向渐变使用）—— 柔和浅色调
const HEAT = {
    hot:  {r:245, g:120, b:120},  // 浅红 — 高价热门区
    warm: {r:240, g:195, b:80},   // 浅琥珀 — 一般区
    cold: {r:100, g:145, b:240},  // 浅蓝 — 边缘冷门区
};

export class Cinema {
    constructor(canvas, seatData) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.sd = seatData;
        this.dragStart=null;this.dragEnd=null;this._hover=null;this.isDragging=false;this._tooltip=null;
        this._clr = CLR; this._heatColors = HEAT;  // 可切换配色
        this._animations = [];  // 座位动画队列
        this._animFrame = null;
        this.bindEvents();
        this.relayout();
        this.redraw();
    }

    /* ========== 布局：固定行高 + 仅水平弧线 ========== */
    relayout() {
        const {rows, cols} = this.sd;
        const dpr = Math.min(window.devicePixelRatio||1, 2);

        let pitch;
        if      (cols<=10) pitch=38;
        else if (cols<=20) pitch=30;
        else               pitch=22;
        const size = Math.round(pitch*0.78);
        const aisle = cols>=14?2:(cols>=8?1:0);
        const vCols = cols+aisle;
        const aisleStart = Math.floor((vCols-aisle)/2);

        const maxW=Math.min(window.innerWidth-32,1100);
        const maxH=Math.min(window.innerHeight-200,680);
        const topPad=85, botPad=45;
        const needW=120+vCols*pitch+80;
        const needH=topPad+rows*pitch+botPad+20;
        this.dispW=Math.round(Math.min(needW,maxW));
        this.dispH=Math.round(Math.min(needH,maxH));
        this.canvas.width=this.dispW*dpr;this.canvas.height=this.dispH*dpr;
        this.canvas.style.width=this.dispW+'px';this.canvas.style.height=this.dispH+'px';
        this.ctx.setTransform(dpr,0,0,dpr,0,0);

        const seatTop=topPad+pitch;
        const seatH=this.dispH-seatTop-botPad;
        const rowStep=rows>1?seatH/(rows-1):0;

        this.arcX=this.dispW/2;
        const arcR0=this.dispW*1.3;

        this._pos=[];this._hover=null;this._tooltip=null;
        this._seatSize=size;this._pitch=pitch;
        this._aisleStart=aisleStart;this._aisleCols=aisle;this._vCols=vCols;this._topPad=topPad;

        for(let r=0;r<rows;r++){
            const rowY=seatTop+r*rowStep;
            const R=arcR0+r*pitch*0.55;
            const angleStep=pitch/R;
            const totalAngle=(vCols-1)*angleStep;
            const startAngle=-totalAngle/2;
            const half=size/2;
            const rowPos=[];let rc=0;
            for(let vc=0;vc<vCols;vc++){
                if(aisle>0&&vc>=aisleStart&&vc<aisleStart+aisle)continue;
                const angle=startAngle+vc*angleStep;
                const cx=this.arcX+R*Math.sin(angle);
                rowPos[rc]={x:cx-half,y:rowY-half,cx,cy:rowY};
                rc++;
            }
            this._pos[r]=rowPos;
        }
        this._heat=this._calcHeat();
    }

    /* ========== 热度计算：模拟真实影院票价分布 ========== */
    _calcHeat(){
        const {rows,cols}=this.sd;
        const g=Array.from({length:rows},()=>new Array(cols).fill(0));
        const idealRow=(rows-1)*0.55;
        const idealCol=(cols-1)/2;
        const maxRowD=Math.max(idealRow,rows-1-idealRow);
        const maxColD=Math.max(idealCol,cols-1-idealCol);

        for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
            const seat=this.sd.getSeat(r,c);
            if(seat.status===SEAT_STATUS.OCCUPIED){g[r][c]=0.88;continue;}
            if(seat.isSelected){g[r][c]=0.72;continue;}
            const dr=Math.abs(r-idealRow)/maxRowD;
            const dc=Math.abs(c-idealCol)/maxColD;
            const dist=Math.sqrt(dr*dr*0.4+dc*dc*0.6);
            const base=1-Math.pow(dist,0.65);
            g[r][c]=0.08+base*0.78;
        }
        return g;
    }

    /* ========== 事件 ========== */
    bindEvents(){
        const el=this.canvas;
        el.addEventListener('click',e=>this._click(e));
        el.addEventListener('mousedown',e=>this._down(e));
        el.addEventListener('mousemove',e=>this._move(e));
        el.addEventListener('mouseup',e=>this._up(e));
        el.addEventListener('mouseleave',()=>this._leave());
        el.addEventListener('touchstart',e=>{e.preventDefault();this._down(this._t(e));},{passive:false});
        el.addEventListener('touchmove',e=>{e.preventDefault();this._move(this._t(e));},{passive:false});
        el.addEventListener('touchend',e=>this._up({ctrlKey:false}));
    }
    _t(e){const t=e.touches[0];return{clientX:t.clientX,clientY:t.clientY,ctrlKey:false};}
    _cp(e){const r=this.canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*(this.dispW/r.width),y:(e.clientY-r.top)*(this.dispH/r.height)};}
    _hit(px,py){const s=this._seatSize;const{rows,cols}=this.sd;for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const p=this._pos[r][c];if(px>=p.x-3&&px<=p.x+s+3&&py>=p.y-3&&py<=p.y+s+3)return{row:r,col:c};}return null;}
    _click(e){const p=this._cp(e),s=this._hit(p.x,p.y);if(!s)return;const seat=this.sd.getSeat(s.row,s.col);if(!seat||seat.status===SEAT_STATUS.OCCUPIED)return;seat.isSelected?this.sd.deselectSeat(s.row,s.col):this.sd.selectSeat(s.row,s.col);this._triggerBounce(s.row,s.col);this._heat=this._calcHeat();this.redraw();this._emit();}
    _down(e){const p=this._cp(e);this.dragStart=this._hit(p.x,p.y);this.isDragging=false;}
    _move(e){const p=this._cp(e),s=this._hit(p.x,p.y);if(this.dragStart&&s&&(s.row!==this.dragStart.row||s.col!==this.dragStart.col)){this.isDragging=true;this.dragEnd=s;this.redraw();return;}const prev=this._hover;if(!s&&!prev)return;if(s&&prev&&s.row===prev.row&&s.col===prev.col)return;this._hover=s;this._tooltip=s;this.redraw();this.canvas.style.cursor=s?'pointer':'default';}
    _up(e){if(this.isDragging&&this.dragStart&&this.dragEnd){const r1=Math.min(this.dragStart.row,this.dragEnd.row),r2=Math.max(this.dragStart.row,this.dragEnd.row);const c1=Math.min(this.dragStart.col,this.dragEnd.col),c2=Math.max(this.dragStart.col,this.dragEnd.col);for(let r=r1;r<=r2;r++)for(let c=c1;c<=c2;c++){const st=this.sd.getSeat(r,c);if(st&&st.status===SEAT_STATUS.AVAILABLE)this.sd.selectSeat(r,c);}this._heat=this._calcHeat();this.redraw();this._emit();}this.dragStart=null;this.dragEnd=null;this.isDragging=false;}
    _leave(){this.dragStart=null;this.dragEnd=null;this.isDragging=false;this._hover=null;this._tooltip=null;this.redraw();}
    _emit(){this.canvas.dispatchEvent(new CustomEvent('selectionChange',{detail:{selectedSeats:this.sd.getSelectedSeats(),stats:this.sd.getStats()}}));}

    /* ========== 座位弹性动画 ========== */
    _triggerBounce(row,col){
        this._animations.push({row,col,start:performance.now(),duration:350});
        if(!this._animFrame)this._runAnimations();
    }
    _runAnimations(){
        const now=performance.now();
        this._animations=this._animations.filter(a=>now-a.start<a.duration);
        this.redraw();
        if(this._animations.length>0){
            this._animFrame=requestAnimationFrame(()=>this._runAnimations());
        }else{
            this._animFrame=null;
        }
    }
    /** 获取某座位的动画缩放系数 (1.0=无动画) */
    _getAnimScale(row,col){
        for(const a of this._animations){
            if(a.row===row&&a.col===col){
                const t=(performance.now()-a.start)/a.duration;  // 0→1
                // 弹性缓出: scale 1.0→1.28→0.92→1.0
                if(t>=1)return 1;
                const s=1+0.28*Math.sin(t*Math.PI*2.3)*Math.exp(-t*3.5);
                return Math.max(0.7,Math.min(1.35,s));
            }
        }
        return 1;
    }

    /* ========== 绘制 ========== */
    redraw(){
        const ctx=this.ctx,W=this.dispW,H=this.dispH;ctx.clearRect(0,0,W,H);
        const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#F8FAFC');bg.addColorStop(1,'#FFFFFF');
        ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
        ctx.strokeStyle=this._clr.bgGrid;ctx.lineWidth=1;
        for(let x=0;x<W;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
        for(let y=0;y<H;y+=48){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
        this._drawScreen();this._drawColLabels();this._drawRowLabels();
        this._drawSeats();this._drawDragBox();this._drawTooltip();this._drawLegend();this._drawHallInfo();
    }

    /* ================================================================
     * 银幕：光从曲线向下照射——光形顶边跟随银幕弧线
     * ================================================================ */
    _drawScreen(){
        const ctx=this.ctx, sw=this._vCols*this._pitch*0.78;
        const sx=this.arcX-sw/2, sy=this._topPad*0.38;

        // 光照深度 & 两侧扩散
        const lightH=this.dispH*0.42;
        const spread=70;

        // 光锥路径：顶边跟随银幕弧线，向下逐渐扩散
        ctx.save();
        ctx.beginPath();
        const N=50;  // 采样点
        for(let i=0;i<=N;i++){
            const t=i/N;
            const lx=sx-spread+t*(sw+spread*2);
            // 二次贝塞尔 y(t) = (1-t)²·sy + 2(1-t)t·(sy-14) + t²·sy = sy - 28t(1-t)
            const cy=sy-28*t*(1-t);
            if(i===0)ctx.moveTo(lx,cy);else ctx.lineTo(lx,cy);
        }
        // 右下 → 左下 → 闭合
        ctx.lineTo(sx+sw+spread, sy+lightH);
        ctx.lineTo(sx-spread, sy+lightH);
        ctx.closePath();

        // 纵向渐变：银幕线最亮 → 向下渐隐
        const gl=ctx.createLinearGradient(0,sy-14,0,sy+lightH);
        gl.addColorStop(0,'rgba(37,99,235,0.28)');
        gl.addColorStop(0.18,'rgba(37,99,235,0.10)');
        gl.addColorStop(0.45,'rgba(37,99,235,0.03)');
        gl.addColorStop(1,'rgba(37,99,235,0)');
        ctx.fillStyle=gl;
        ctx.fill();
        ctx.restore();

        // 银幕曲线
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.quadraticCurveTo(this.arcX,sy-14,sx+sw,sy);
        ctx.strokeStyle=this._clr.screen;ctx.lineWidth=3;ctx.stroke();

        // 发光条
        const bar=ctx.createLinearGradient(0,sy-8,0,sy+8);
        bar.addColorStop(0,'rgba(37,99,235,0.45)');
        bar.addColorStop(0.5,'rgba(59,130,246,0.60)');
        bar.addColorStop(1,'rgba(37,99,235,0.10)');
        ctx.fillStyle=bar;ctx.fillRect(sx,sy-3,sw,6);

        // 文字
        ctx.fillStyle='#2563EB';ctx.font='bold 13px "Microsoft YaHei","PingFang SC",sans-serif';
        ctx.textAlign='center';ctx.fillText('SCREEN  银  幕',this.arcX,sy-18);
    }

    _drawColLabels(){
        const ctx=this.ctx,{cols}=this.sd,r0=this._pos[0];
        if(!r0||cols<6)return;
        ctx.fillStyle=this._clr.rowLabel;ctx.font='9px "Microsoft YaHei",sans-serif';
        ctx.textAlign='center';ctx.textBaseline='bottom';
        const step=Math.max(1,Math.floor(cols/12));
        for(let c=0;c<cols;c+=step){const p=r0[c];if(!p)continue;ctx.fillText(`${c+1}`,p.cx,this._topPad-4);}
    }

    _drawRowLabels(){
        const ctx=this.ctx,{rows}=this.sd,s=this._seatSize;
        ctx.fillStyle=this._clr.rowLabel;ctx.font=`${Math.max(10,s*0.5)}px "Microsoft YaHei",sans-serif`;
        ctx.textAlign='right';ctx.textBaseline='middle';
        for(let r=0;r<rows;r++){const p=this._pos[r][0];ctx.fillText(`${r+1}排`,p.x-s/2-8,p.cy);}
    }

    _drawSeats(){
        const{rows,cols}=this.sd;
        for(let r=rows-1;r>=0;r--)for(let c=0;c<cols;c++){
            const seat=this.sd.getSeat(r,c),p=this._pos[r][c];
            const hov=this._hover&&this._hover.row===r&&this._hover.col===c;
            this._drawOne(p.x,p.y,seat,hov,r,c);
        }
    }

    /* ================================================================
     * 单个座位：空座=白色填充，热度=边框颜色（红/琥珀/蓝）
     * ================================================================ */
    _drawOne(x,y,seat,hovered,r,c){
        const ctx=this.ctx, s=this._seatSize, rad=Math.max(3,s*0.25);
        // 弹性动画缩放
        const scale=this._getAnimScale(r,c);
        if(scale!==1){const cx=x+s/2,cy=y+s/2;ctx.save();ctx.translate(cx,cy);ctx.scale(scale,scale);ctx.translate(-cx,-cy);}

        // 热度 → 边框颜色
        const hv=this._heat[r]?.[c]||0;
        let heatStroke='';
        if(hv>0.6)heatStroke=`rgb(${this._heatColors.hot.r},${this._heatColors.hot.g},${this._heatColors.hot.b})`;
        else if(hv>0.3)heatStroke=`rgb(${this._heatColors.warm.r},${this._heatColors.warm.g},${this._heatColors.warm.b})`;
        else heatStroke=`rgb(${this._heatColors.cold.r},${this._heatColors.cold.g},${this._heatColors.cold.b})`;

        // --- 悬停光晕（仅非已售座位）---
        if(hovered&&seat.status!==SEAT_STATUS.OCCUPIED){
            const cx=x+s/2, cy=y+s/2;
            const haloPad=s*0.6;
            const rectHalf=(s+haloPad)/2;
            const halo=ctx.createRadialGradient(cx,cy,s*0.18,cx,cy,rectHalf);
            if(seat.isSelected){
                halo.addColorStop(0,'rgba(245,158,11,0.50)');
                halo.addColorStop(0.4,'rgba(245,158,11,0.15)');
                halo.addColorStop(1,'rgba(245,158,11,0)');
            }else if(seat.isRecommended){
                halo.addColorStop(0,'rgba(139,92,246,0.50)');
                halo.addColorStop(0.4,'rgba(139,92,246,0.15)');
                halo.addColorStop(1,'rgba(139,92,246,0)');
            }else{
                halo.addColorStop(0,'rgba(229,231,235,0.50)');
                halo.addColorStop(0.4,'rgba(229,231,235,0.15)');
                halo.addColorStop(1,'rgba(229,231,235,0)');
            }
            ctx.fillStyle=halo;
            this._rr(ctx,x-haloPad/2,y-haloPad/2,s+haloPad,s+haloPad,rad+3);
            ctx.fill();
        }

        // --- 座位本体 ---
        let fill,stroke;
        if(seat.status===SEAT_STATUS.OCCUPIED){
            fill=this._clr.sold; stroke=heatStroke;          // 灰色填充+热度边框
        }else if(seat.isSelected){
            fill=this._clr.select; stroke=this._clr.selectS;        // 琥珀色，固定边框
        }else if(seat.isRecommended){
            fill=this._clr.rec; stroke=this._clr.recS;              // 紫色，固定边框
        }else{
            fill=this._clr.avail; stroke=heatStroke;          // 白色填充+热度边框
        }

        ctx.fillStyle=fill;ctx.strokeStyle=stroke;
        ctx.lineWidth=2;
        this._rr(ctx,x,y,s,s,rad);ctx.fill();ctx.stroke();

        // 选中 ✓
        if(seat.isSelected){
            ctx.fillStyle='#1C1917';ctx.font=`bold ${Math.max(9,s*0.48)}px Arial`;
            ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('✓',x+s/2,y+s/2);
        }
        if(scale!==1)ctx.restore();
    }

    _drawDragBox(){
        if(!this.isDragging||!this.dragStart||!this.dragEnd)return;
        const p1=this._pos[this.dragStart.row][this.dragStart.col],p2=this._pos[this.dragEnd.row][this.dragEnd.col];
        const x=Math.min(p1.x,p2.x),y=Math.min(p1.y,p2.y);
        const w=Math.abs(p2.x-p1.x)+this._seatSize,h=Math.abs(p2.y-p1.y)+this._seatSize;
        const ctx=this.ctx;ctx.save();ctx.setLineDash([5,5]);ctx.strokeStyle=this._clr.dragLine;ctx.lineWidth=2;
        ctx.strokeRect(x-2,y-2,w+4,h+4);ctx.setLineDash([]);ctx.restore();
    }

    _drawTooltip(){
        if(!this._tooltip)return;
        const s=this._tooltip,seat=this.sd.getSeat(s.row,s.col);if(!seat)return;
        const p=this._pos[s.row][s.col],ctx=this.ctx;
        const text=`${s.row+1}排${s.col+1}座  ¥${seat.price}`;ctx.font='12px "Microsoft YaHei",sans-serif';
        const tw=ctx.measureText(text).width+16,th=26;let tx=p.cx-tw/2,ty=p.y-th-6;
        if(ty<4)ty=p.y+this._seatSize+6;if(tx<4)tx=4;if(tx+tw>this.dispW)tx=this.dispW-tw-4;
        ctx.fillStyle=this._clr.tooltipBg;ctx.strokeStyle=this._clr.tooltipBd;ctx.lineWidth=1;
        this._rr(ctx,tx,ty,tw,th,6);ctx.fill();ctx.stroke();
        ctx.fillStyle=this._clr.tooltipTxt;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,tx+tw/2,ty+th/2);
    }

    _drawLegend(){
        const items=[
            {c:this._clr.avail,t:'空座',border:`rgb(${this._heatColors.hot.r},${this._heatColors.hot.g},${this._heatColors.hot.b})`},
            {c:this._clr.select,t:'已选',border:this._clr.selectS},
            {c:this._clr.sold,t:'已售',border:this._clr.soldS},
            {c:this._clr.rec,t:'推荐',border:this._clr.recS},
            {c:`rgb(${this._heatColors.hot.r},${this._heatColors.hot.g},${this._heatColors.hot.b})`,t:'热门(中)',border:null},
            {c:`rgb(${this._heatColors.warm.r},${this._heatColors.warm.g},${this._heatColors.warm.b})`,t:'一般',border:null},
            {c:`rgb(${this._heatColors.cold.r},${this._heatColors.cold.g},${this._heatColors.cold.b})`,t:'冷门(边)',border:null},
        ];
        const ctx=this.ctx,y=this.dispH-26,startX=this.dispW-items.length*68-10;
        ctx.font='11px "Microsoft YaHei",sans-serif';
        items.forEach((it,i)=>{
            const x=startX+i*68;
            ctx.fillStyle=it.c;
            ctx.fillRect(x,y-5,10,10);
            if(it.border){ctx.strokeStyle=it.border;ctx.lineWidth=1.5;ctx.strokeRect(x,y-5,10,10);}
            ctx.fillStyle=this._clr.legend;ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(it.t,x+14,y);
        });
    }

    _drawHallInfo(){
        const hall=HALL_CONFIG[this.sd.hallType],ctx=this.ctx;
        ctx.fillStyle=this._clr.hallInfo;ctx.font='11px "Microsoft YaHei",sans-serif';ctx.textAlign='left';ctx.textBaseline='top';
        ctx.fillText(`${hall.name}·${hall.desc}·${hall.total}座`,10,this.dispH-22);
    }

    _rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}

    setColorblindMode(enabled){
        this._clr = enabled ? CLR_CB : CLR;
        this._heatColors = enabled ? HEAT_CB : HEAT;
        this.redraw();
    }
    reload(){this.relayout();this.redraw();}
    resize(){this.relayout();this.redraw();}
}

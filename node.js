import { MountReactionModule, ReactionModule } from "@/engine/state/reaction-module";
import { TextWidget2D } from "./class";
import { AnnInstance2D } from "../../annotation/2d/common/class";
import { Container } from "pixi.js";
import { autorun, computed, reaction } from "mobx";
import { IAnnWidgetHelper2D } from "../types";
import { Vertex2D } from "@/engine/shape/types";
import { engineState } from "@/engine/state";
import { ShapeTypes } from "@/engine/shape/enums";
import { ServerResultAttrData } from "@/export/types";
import { getImageTextContainer } from "@/engine/actions/image-view";
import { engineApi } from "@/engine/actions";

export class AnnTextVertexIndexWidgetHelper extends MountReactionModule implements IAnnWidgetHelper2D {
    widgets: TextWidget2D[] = []
    timer: number = 0
    options: {
        parent: Container
    }
    ann: AnnInstance2D<any>
    group: Container = new Container()
    constructor(ann: AnnInstance2D<any>, options: {
        parent: Container
    }) {
        super(ann)
        this.options = options
        this.options.parent = getImageTextContainer()
        this.ann = ann
        this.watchParent()
    }


    get showVertexText() {
        const enableShow = this.ann.showVertexIndex || this.ann.showVertexAttr
        return enableShow 
    }

    mount() {
        const onShow = () => {
            const resetVertexFilter = (v: boolean) => {
                this.disposeReactionGroup('vertex-attr-filter')
                if (v) {
                    this.addReactionGroup({
                        name: 'vertex-attr-filter',
                        disposers: [
                            reaction(() => engineState.ui.annVertexAttrFilter.visibleAttrOptions, () => {
                                this.resetTextWidgets()
                            }),
                            reaction(() => engineState.ui.annVertexAttrFilter.attrKey, () => {
                                this.resetTextWidgets()
                            }),
                            reaction(() => this.ann.shapeData, () => {
                                this.resetTextWidgets()
                            })
                        ]
                    })
                }
            }
            resetVertexFilter(engineState.ui.annVertexAttrFilter.enable)
            this.resetTextWidgets()
            this.options.parent.addChild(this.group)
            this.widgets.forEach(w => w.addToCanvas())
            this.addReactionGroup({
                name: 'display-reaction',
                disposers: [
                    reaction(() => engineState.ui.annVertexAttrFilter.enable, (v) => {
                        resetVertexFilter(v)
                        this.resetTextWidgets()
                    }),
        
                    reaction(() => this.ann.shapeData, () => {
                        this.resetTextWidgets()
                    }),
                    reaction(() => [
                        this.ann.showVertexIndex,
                        this.ann.showVertexAttr
                    ], () => {
                        this.resetTextWidgets()
                    }, {
                        delay: 100
                    }),
                    reaction(() => [
                        this.ann.vertexIndexTextColor,
                    ], () => {
                        this.resetTextWidgets()
                    }, {
                        delay: 100
                    }),
                    reaction(() => [
                        engineState.imageView.activeViewer.adjustTranslation.x,
                        engineState.imageView.activeViewer.adjustTranslation.y,
                        engineState.imageView.activeViewer.zoom,
                    ], () => {
                     
                        if (this.timer) {
                            window.clearTimeout(this.timer)
                            this.timer = 0
                        }
                        this.group.visible = false
                        this.timer = window.setTimeout(() => {
                            this.resetTextPosition()
                            this.group.visible = true
                        }, 100)
                    }, {
                        delay: 100
                    })
                ]
            })
        }

        this.setupReaction([
            reaction(() => this.showVertexText, (show) => {
                if (show) {
                    onShow()
                } else {
                    this.disposeReactionGroup('display-reaction')
                }
            })
        ])

        if (this.showVertexText) {
            onShow()
        }
    }
    unmount(): void {
        this.disposeAutorun()
        this.group.removeChildren()

        this.widgets.forEach(w => {
            w.removeFromCanvas()
        })
        this.widgets = []
        // clear group children
        this.group.removeChildren()
        window.clearTimeout(this.timer)

    }

    clear() {
        this.widgets.forEach(w => {
            if (w.graphics?.parent) {
                w.graphics.parent.removeChild(w.graphics)
            }
        })
    }
    destroy() {
        this.unmount()
        this.unwatchParent()
    }

    private getVertexText(index: number) {

        let no = index + 1
        if (this.ann.type === ShapeTypes.CUBOID) {
            no = this.ann.shapeData.vertices[index]._number
        }

        const v = this.ann.shapeData.vertices[index]
        const visible = v ? this.ann.isVertexVisible(v._uuid) : false

        if (!visible) {
            return ''
        }
        let attrText = ''


        this.ann.labelAttrs
        this.ann.groupNo

        if (this.ann.shapeData.vertices) {
            const vertex = this.ann.shapeData.vertices[index]
            const attrs = vertex ? (v._attrs2 || v._attrs || []) as ServerResultAttrData[] : []
            if (attrs.length) {
                attrText = attrs.map(a => `${a.values.join(',')}`).join(' ')
            }
        }

        return (this.ann.showVertexIndex ? `${no}` : '')
            + (this.ann.showVertexAttr ? (attrText ? ` ${attrText}` : '') : '')
    }

    private resetTextPosition() {
        this.widgets.forEach(w => {
            const v = this.ann.shapeData.vertices.find((v: Vertex2D) => v._uuid === w.uuid)
            if (v) {
                const pos = engineApi.convertImageLocalPositionToGlobal(v.x, v.y)
                w.setPosition({
                    ...pos
                })
            }
        })
    }
    private resetTextWidgets() {
        if (!this.showVertexText) {
            this.widgets.forEach(w => {
                w.removeFromCanvas()
            })
            this.widgets = []
            return
        }
        const widgets: TextWidget2D[] = []
        const vertices = this.ann.shapeData.vertices as Vertex2D[]
        const color = this.ann.vertexIndexTextColor
        const colorNum = parseInt(color.replace('#', ''), 16)
        let opacity = 1
        if (!this.ann.enableShapeUpdate) {
            opacity /= 2
        }
        const fontSize = 10
        const offset = 6
        // const fontSize = this.ann.enableShapeUpdate ? 12 : 8
        // const offset  = this.ann.enableShapeUpdate ? 8 : 4
        const fillColorStyle = {
            normal: {
                color: colorNum,
                opacity: opacity,
            },
            active: {
                color: colorNum,
                opacity: opacity,
            },
            hover: {
                color: colorNum,
                opacity: opacity,
            },
        }
        vertices.forEach((v, index) => {
            const w = this.widgets.find(w => w.uuid === v._uuid)
            const text = this.getVertexText(index)
            const pos = engineApi.convertImageLocalPositionToGlobal(v.x, v.y)
            if (w) {
                w.setText(text)
                w.setPosition({
                    ...pos
                })
                w.setVisibility(text ? true : false)
                w.setFillStyle(fillColorStyle)
                widgets.push(w)
            } else {
                const w = new TextWidget2D({
                    parent: this.group,
                    uuid: v._uuid,
                    visible: text ? true : false,
                    fontSize: fontSize,
                    offset: {
                        x: offset,
                        y: offset,
                    },
                    isNumber: !isNaN(parseInt(text)),
                    fillStyle: fillColorStyle,
                    position: {
                        ...pos
                    },
                    text: text,
                })
                widgets.push(w)
                w.addToCanvas()
            }
        })
        this.widgets.forEach(w => {
            if (!widgets.includes(w)) {
                w.removeFromCanvas()
                w.destroy()
            }
        })
        this.widgets = widgets
        this.widgets.forEach(w => {
            w.setVisibility(true)
            if (w.graphics && !w.graphics.parent) {
                this.options.parent.addChild(w.graphics)
            }
        })

    }
}


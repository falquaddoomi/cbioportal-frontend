import * as React from "react";
import Plot from 'react-plotly.js';
import {ClinicalEvent} from "shared/api/generated/CBioPortalAPI";
import {PlotData} from "plotly.js";

export interface IFastDrugsBarPlotProps {
    data: ClinicalEvent[];
    showTitleBar?: boolean;
    cssClass?:string;
    showFilter?:boolean;
    showCopyDownload?:boolean;
}

export interface DistilledRow {
    [x:string]: any
}

interface Series {
    x: number[],
    y: string[],
    marker_color: string[]
}

export default class FastDrugsBarPlot extends React.Component<IFastDrugsBarPlotProps, {}> {
    private getBarChartData() {
        const plot_data = this.props.data
            .filter(row => row.eventType === "LAB_TEST")
            .map(row => {
                const fields:DistilledRow = row.attributes.reduce((acc, x) => { acc[x.key] = x.value; return acc; }, {} as DistilledRow);
                return {
                    drug: fields.SUBTYPE, response: fields.AllMel, isSignificant: fields.isSignificant
                };
            });

        console.log(plot_data);

        plot_data.sort((a, b) => a.response - b.response);

        // zip (response, drug, isSignificant) into their own respective series'
        const series = plot_data.reduce((acc, x) => {
            acc.x.push(x.response);
            acc.y.push(x.drug);
            acc.marker_color.push(x.isSignificant === 'True' ? '#1f78b4' : '#a6cee3');
            return acc;
        }, {x: [], y: [], marker_color: []} as Series);

        // @ts-ignore
        const data_bar:PlotData[] = [{
            "type": "bar",
            "x": series.x,
            "y": series.y,
            "z": [],
            "marker": { "color": series.marker_color },
            "orientation": "h"
        }];

        const layout_bar = {
            "height": 1300,
            // "width": 1200,
            "autosize": true,
            "xaxis": {
                "title": "Response",
                "automargin": true,
                "range": [-0.1, 0.1]
            },
            "yaxis": {
                "automargin": true
            }
        };

        return {
            data_bar, layout_bar
        };
    }

    public render() {
        const {data_bar, layout_bar} = this.getBarChartData();

        return <div>
            <Plot
                data={data_bar} layout={layout_bar} useResizeHandler
                style={{ width: '100%', maxWidth: '1200px' }}
            />
        </div>
    }
}

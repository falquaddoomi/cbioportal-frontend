import * as React from "react";
import * as d3Scale from "d3-scale";
import {ClinicalEvent} from "../../../shared/api/generated/CBioPortalAPI";
import LazyMobXTable from "shared/components/lazyMobXTable/LazyMobXTable";

import styles from './style/patientTable.module.scss';
import {SHOW_ALL_PAGE_SIZE} from "../../../shared/components/paginationControls/PaginationControls";

export interface IClinicalEventTableProps {
    data: ClinicalEvent[];
    showTitleBar?: boolean;
    cssClass?:string;
    showFilter?:boolean;
    showCopyDownload?:boolean;
    heatmap?:boolean;
}

class PatientEventTable extends LazyMobXTable<IPatientEventRow> {}

interface IPatientEventRow {
    columns: any;
}

export default class ClinicalInformationEventsTable extends React.Component<IClinicalEventTableProps, {}> {

    public prepareData(eventData: ClinicalEvent[]) {

        const tableData: IPatientEventRow[] = [];

        let i = 0;
        const j = 0;
        for (i = 0; i < eventData.length; i++) {
            const row = eventData[i];
            if (row.eventType === "LAB_TEST") {
                tableData.push({"columns" : row.attributes});
            }
        }

        return tableData;
    }

    public getScale(dataItems: IPatientEventRow[], minColor='red', maxColor='blue') {
        console.log(dataItems);

        // compute the min, max of the drugs that have specified values
        const domain = dataItems
            .filter(x => x.columns.length > 1) // drugs that have screening values
            .map(x => x.columns.slice(1)) // exclude the drug label column (column 0)
            .map(x => x.filter((c:any) => c.key !== 'isSignificant')) // exclude the 'isSignificant' column, too
            .reduce((a, x) => {
                const rowMin = Math.min(...x.map((c:{value: Number}) => c.value));
                const rowMax = Math.max(...x.map((c:{value: Number}) => c.value));

                a[0] = (a[0] === null) ? rowMin : Math.min(rowMin, a[0]);
                a[1] = (a[1] === null) ? rowMax : Math.max(rowMax, a[1]);
                return a;
            }, [null, null]);

        return {
            domain: domain,
            scale: d3Scale.scaleLinear<string, Number>()
                .domain(domain)
                .range([minColor, maxColor])
        }
    }

    public render() {

        const tableData = this.prepareData(this.props.data);

        if (!tableData) {
            return <div>Unable to load data for this patient</div>;
        }

        return (
            <PatientEventTable
                data={tableData}
                columns={this.getColumnsAndData(tableData)}
                showPagination={false}
                showColumnVisibility={false}
                className={[styles.patientTable, this.props.heatmap ? styles.heatmapTable : ""].join(" ")}
                initialItemsPerPage={SHOW_ALL_PAGE_SIZE}
                initialSortColumn={tableData && tableData[0] ? tableData[0].columns[1].key : null}
                initialSortDirection={"desc"}
                showFilter={(this.props.showFilter === false) ? false : true }
                showCopyDownload={(this.props.showCopyDownload === false) ? false : true }
            />
        );
    }

    private getDisplayValue(data:IPatientEventRow, key: string):string {
        for (const column of data.columns) {
            if (column.key === key) {
                return column.value;
            }
        }
        return "";

    }

    private getSortingValue(data:IPatientEventRow, key: string):number|string {
        for (const column of data.columns) {
            if (column.key === key) {
                if (isNaN(Number(column.value))) {
                    return Number.NEGATIVE_INFINITY;
                }
                return Number(column.value);
            }
        }
        return Number.NEGATIVE_INFINITY;

    }

    private getColumnsAndData(dataItems: IPatientEventRow[]): any {
        if (!dataItems || !dataItems[0])
            return [];

        const columnsAndData: any = [];

        const hmScale = this.props.heatmap ? this.getScale(dataItems) : null;

        for (const column in dataItems[0].columns) {
            if (dataItems[0].columns[column].key === "SUBTYPE") {
                columnsAndData.push({
                    name: dataItems[0].columns[column].key,
                    render: (data:IPatientEventRow) => <span>{this.getDisplayValue(data, dataItems[0].columns[column].key)}</span>,
                    download: (data:IPatientEventRow) => this.getDisplayValue(data, dataItems[0].columns[column].key),
                    sortBy: (data:IPatientEventRow)=> this.getDisplayValue(data, dataItems[0].columns[column].key)
                });
            }
            else if (dataItems[0].columns[column].key !== "isSignificant") {
                columnsAndData.push({
                    name: dataItems[0].columns[column].key,
                    render: (data:IPatientEventRow) => {
                        const displayVal = this.getDisplayValue(data, dataItems[0].columns[column].key);
                        if (this.props.heatmap && hmScale && Number(displayVal)) {
                            const num = Number(displayVal);
                            return (
                                <div className={styles.heatmapCell} style={{backgroundColor: hmScale.scale(num)}}>
                                {num.toFixed(3)}
                                </div>
                            );
                        }

                        return <span>{this.getDisplayValue(data, dataItems[0].columns[column].key)}</span>;
                    },
                    download: (data:IPatientEventRow) => this.getDisplayValue(data, dataItems[0].columns[column].key),
                    sortBy: (data:IPatientEventRow)=> this.getSortingValue(data, dataItems[0].columns[column].key)
                });
            }
        }

        return columnsAndData;
    }
}

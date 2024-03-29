import * as React from 'react';
import * as _ from 'lodash';
import $ from 'jquery';
import { default as ReactBootstrap} from 'react-bootstrap';
import GenomicOverview from './genomicOverview/GenomicOverview';
import {CancerStudy, ClinicalData} from "shared/api/generated/CBioPortalAPI";
import { ClinicalDataBySampleId } from "../../shared/api/api-types-extended";
import { RequestStatus } from "../../shared/api/api-types-extended";
import FeatureTitle from '../../shared/components/featureTitle/FeatureTitle';
import {If, Then, Else} from 'react-if';
import SampleManager from './sampleManager';
import SelectCallback = ReactBootstrap.SelectCallback;
import {ThreeBounce} from 'better-react-spinkit';
import PatientHeader from './patientHeader/PatientHeader';
import {PaginationControls} from "../../shared/components/paginationControls/PaginationControls";
import {IColumnVisibilityDef} from "shared/components/columnVisibilityControls/ColumnVisibilityControls";
import {toggleColumnVisibility} from "shared/components/lazyMobXTable/ColumnVisibilityResolver";
import { PatientViewPageStore } from './clinicalInformation/PatientViewPageStore';
import ClinicalInformationPatientTable from "./clinicalInformation/ClinicalInformationPatientTable";
import ClinicalInformationEventsTable from "./clinicalInformation/ClinicalInformationEventsTable";
import ClinicalInformationSamples from "./clinicalInformation/ClinicalInformationSamplesTable";
import {observer, inject } from "mobx-react";
import {getSpanElementsFromCleanData} from './clinicalInformation/lib/clinicalAttributesUtil.js';
import CopyNumberTableWrapper from "./copyNumberAlterations/CopyNumberTableWrapper";
import {reaction, computed, autorun, IReactionDisposer, observable, action} from "mobx";
import Timeline from "./timeline/Timeline";
import {default as PatientViewMutationTable} from "./mutation/PatientViewMutationTable";
import PathologyReport from "./pathologyReport/PathologyReport";
import { MSKTabs, MSKTab } from "../../shared/components/MSKTabs/MSKTabs";
import { validateParametersPatientView } from '../../shared/lib/validateParameters';
import LoadingIndicator from "shared/components/loadingIndicator/LoadingIndicator";
import ValidationAlert from "shared/components/ValidationAlert";
import AjaxErrorModal from "shared/components/AjaxErrorModal";
import AppConfig from 'appConfig';
import { getMouseIcon } from './SVGIcons';

import './patient.scss';
import IFrameLoader from "../../shared/components/iframeLoader/IFrameLoader";
import {getSampleViewUrl} from "../../shared/api/urls";
import FastDrugsBarPlot from "pages/patientView/clinicalInformation/FastDrugsBarPlot";

const patientViewPageStore = new PatientViewPageStore();

const win:any = (window as any);

win.patientViewPageStore = patientViewPageStore;

export interface IPatientViewPageProps {
    routing: any;
    samples?: ClinicalDataBySampleId[];
    loadClinicalInformationTableData?: () => Promise<any>;
    patient?: {
        id: string,
        clinicalData: ClinicalData[]
    };
    clinicalDataStatus?: RequestStatus;
}

export interface IPatientViewState {
    heatmap: boolean;
}

@inject('routing')
@observer
export default class PatientViewPage extends React.Component<IPatientViewPageProps, IPatientViewState> {

    @observable private mutationTableColumnVisibility: {[columnId: string]: boolean}|undefined;
    @observable private cnaTableColumnVisibility: {[columnId: string]: boolean}|undefined;

    private updatePageTitleReaction: IReactionDisposer;
    private updateMetaReaction: IReactionDisposer;

    constructor(props: IPatientViewPageProps) {

        super();

        this.state = {
            heatmap: false
        };

        //TODO: this should be done by a module so that it can be reused on other pages
        const reaction1 = reaction(
            () => [props.routing.location.query, props.routing.location.hash],
            ([query,hash]) => {

                const validationResult = validateParametersPatientView(query);

                if (validationResult.isValid) {

                    patientViewPageStore.urlValidationError = null;

                    if ('studyId' in query) {
                        patientViewPageStore.studyId = query.studyId;
                    }
                    if ('caseId' in query) {
                        patientViewPageStore.setPatientId(query.caseId as string);
                    } else if ('sampleId' in query)
                    {
                        patientViewPageStore.setSampleId(query.sampleId as string);
                    }

                    // if there is a navCaseId list in url
                    const navCaseIdMatch = hash.match(/navCaseIds=([^&]*)/);
                    if (navCaseIdMatch && navCaseIdMatch.length > 1) {
                        const navCaseIds = navCaseIdMatch[1].split(',');
                        patientViewPageStore.patientIdsInCohort = navCaseIds.map((entityId:string)=>{
                            return entityId.includes(':') ? entityId : patientViewPageStore.studyId + ':' + entityId;
                        });
                    }

                } else {
                    patientViewPageStore.urlValidationError = validationResult.message;
                }

            },
            { fireImmediately:true }
        );

        this.updatePageTitleReaction = reaction(
            () => patientViewPageStore.pageTitle,
            (title:string) => {
                win.document.title = title;
            },
            { fireImmediately:true }
        );

        this.updateMetaReaction = autorun(
            () => {
                const study = patientViewPageStore.studyMetaData.result;
                if (study) {
                    // first kill any existing meta tag
                    $("meta[name=description]").remove();
                    const id = ((patientViewPageStore.pageMode === "patient") ?
                        patientViewPageStore.patientId : patientViewPageStore.sampleId);
                    const content =
                        `${id} from ${study.name}`;
                    const meta = $(`<meta name="description" content="${content}">`).prependTo("head");
                }
            }
        );


        this.onMutationTableColumnVisibilityToggled = this.onMutationTableColumnVisibilityToggled.bind(this);
        this.onCnaTableColumnVisibilityToggled = this.onCnaTableColumnVisibilityToggled.bind(this);
    }

    public componentWillUnmount(){
        //dispose reaction
        this.updatePageTitleReaction();
        this.updateMetaReaction();
    }

    public handleSampleClick(id: string, e: React.MouseEvent<HTMLAnchorElement>) {
        if (!e.shiftKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            this.props.routing.updateRoute({ caseId:undefined, sampleId:id });
        }
        // otherwise do nothing, we want default behavior of link
        // namely that href will open in a new window/tab
    }

    private handleTabChange(id: string) {

        this.props.routing.updateRoute({ tab: id });

    }

    private handlePatientClick(id: string) {

        let values = id.split(":");
        if(values.length == 2){
            this.props.routing.updateRoute({ studyId: values[0], caseId: values[1], sampleId: undefined });
        } else {
            this.props.routing.updateRoute({ caseId: id, sampleId: undefined });
        }

    }

    @computed get cnaTableStatus() {
        if (patientViewPageStore.molecularProfileIdDiscrete.isComplete) {
            if (patientViewPageStore.molecularProfileIdDiscrete.result === undefined) {
                return "unavailable";
            } else if (patientViewPageStore.discreteCNAData.isComplete) {
                return "available";
            } else {
                return "loading";
            }
        } else {
            return "loading";
        }
    }

    @action private onCnaTableColumnVisibilityToggled(columnId: string, columnVisibility?: IColumnVisibilityDef[])
    {
        this.cnaTableColumnVisibility = toggleColumnVisibility(
            this.cnaTableColumnVisibility, columnId, columnVisibility);
    }

    @action private onMutationTableColumnVisibilityToggled(columnId: string, columnVisibility?: IColumnVisibilityDef[])
    {
        this.mutationTableColumnVisibility = toggleColumnVisibility(
            this.mutationTableColumnVisibility, columnId, columnVisibility);
    }

    private shouldShowPathologyReport(patientViewPageStore: PatientViewPageStore): boolean {
        return patientViewPageStore.pathologyReport.isComplete && patientViewPageStore.pathologyReport.result.length > 0;
    }

    public render() {

        let sampleManager: SampleManager | null = null;
        let sampleHeader: (JSX.Element | undefined)[] | null = null;
        let cohortNav: JSX.Element | null = null;
        let studyName: JSX.Element | null = null;

        if (patientViewPageStore.urlValidationError) {
            return <ValidationAlert urlValidationError={patientViewPageStore.urlValidationError} />;
        }

        if (patientViewPageStore.studyMetaData.isComplete) {
            let study = patientViewPageStore.studyMetaData.result;
            studyName = <a href={`study?id=${study.studyId}`} className="studyMetaBar_studyName">{study.name}</a>;
        }

        if (patientViewPageStore.patientViewData.isComplete && patientViewPageStore.studyMetaData.isComplete) {
            let patientData = patientViewPageStore.patientViewData.result;
            if (patientViewPageStore.clinicalEvents.isComplete && patientViewPageStore.clinicalEvents.result.length > 0) {
                sampleManager = new SampleManager(patientData.samples!, patientViewPageStore.clinicalEvents.result);
            } else {
                sampleManager = new SampleManager(patientData.samples!);
            }

            sampleHeader = _.map(sampleManager!.samples, (sample: ClinicalDataBySampleId) => {
                const isPDX:boolean = (sampleManager &&
                    sampleManager.clinicalDataLegacyCleanAndDerived &&
                    sampleManager.clinicalDataLegacyCleanAndDerived[sample.id] &&
                    sampleManager.clinicalDataLegacyCleanAndDerived[sample.id].DERIVED_NORMALIZED_CASE_TYPE === 'Xenograft'
                );
                return (
                    <div className="patientSample">
                        <span className='clinical-spans'>
                            {
                                sampleManager!.getComponentForSample(sample.id, 1, '',
                                    <span style={{display:'inline-flex'}}>
                                        {'\u00A0'}
                                        {isPDX && getMouseIcon()}
                                        {isPDX && '\u00A0'}
                                        <a
                                            href={getSampleViewUrl(patientViewPageStore.studyMetaData.result!.studyId, sample.id)}
                                            target="_blank"
                                            onClick={(e: React.MouseEvent<HTMLAnchorElement>) => this.handleSampleClick(sample.id, e)}
                                        >
                                            {sample.id}
                                        </a>
                                        {sampleManager &&
                                         sampleManager.clinicalDataLegacyCleanAndDerived[sample.id] &&
                                         getSpanElementsFromCleanData(sampleManager.clinicalDataLegacyCleanAndDerived[sample.id], patientViewPageStore.studyId)}
                                    </span>
                                )
                            }
                        </span>
                    </div>
                );
            });

            if (sampleHeader && sampleHeader.length > 0 && patientViewPageStore.pageMode === 'sample' && patientViewPageStore.patientId) {
                sampleHeader.push(
                    <button className="btn btn-default btn-xs" onClick={()=>this.handlePatientClick(patientViewPageStore.patientId)}>Show all samples</button>
                );
            }
        }

        if (patientViewPageStore.patientIdsInCohort && patientViewPageStore.patientIdsInCohort.length > 0) {
            const indexInCohort = patientViewPageStore.patientIdsInCohort.indexOf(patientViewPageStore.studyId + ':' + patientViewPageStore.patientId);
            cohortNav = (
                <PaginationControls
                    currentPage={indexInCohort + 1}
                    showMoreButton={false}
                    showItemsPerPageSelector={false}
                    showFirstPage={true}
                    showLastPage={true}
                    textBetweenButtons={` of ${patientViewPageStore.patientIdsInCohort.length} patients`}
                    firstPageDisabled={indexInCohort === 0}
                    previousPageDisabled={indexInCohort === 0}
                    nextPageDisabled={indexInCohort === patientViewPageStore.patientIdsInCohort.length-1}
                    lastPageDisabled={indexInCohort === patientViewPageStore.patientIdsInCohort.length-1}
                    onFirstPageClick={() => this.handlePatientClick(patientViewPageStore.patientIdsInCohort[0]) }
                    onPreviousPageClick={() => this.handlePatientClick(patientViewPageStore.patientIdsInCohort[indexInCohort-1]) }
                    onNextPageClick={() => this.handlePatientClick(patientViewPageStore.patientIdsInCohort[indexInCohort+1]) }
                    onLastPageClick={() => this.handlePatientClick(patientViewPageStore.patientIdsInCohort[patientViewPageStore.patientIdsInCohort.length-1]) }
                    onChangeCurrentPage={(newPage) => {
                        if (newPage > 0 && newPage <= patientViewPageStore.patientIdsInCohort.length) {
                            this.handlePatientClick(patientViewPageStore.patientIdsInCohort[newPage - 1]);
                        }
                    }}
                    pageNumberEditable={true}
                    className="cohortNav"
                />
            );
        }

        return (
            <div className="patientViewPage">

                {/*<AjaxErrorModal*/}
                    {/*show={(patientViewPageStore.ajaxErrors.length > 0)}*/}
                    {/*onHide={()=>{ patientViewPageStore.clearErrors() }}*/}
                    {/*title={`Can't find ${patientViewPageStore.pageMode} ${patientViewPageStore.caseId} in study ${patientViewPageStore.studyId}.`}*/}
                    {/*troubleshooting={["Check that your URL parameters are valid.", "Try refreshing the page.", "Make sure you are connected to the internet."]}*/}
                {/*/>*/}

                <div className="topBanner">

                {  (patientViewPageStore.patientViewData.isComplete) && (
                    <div className="patientPageHeader">
                        <i className="fa fa-user-circle-o patientIcon" aria-hidden="true"></i>
                        <div className="patientDataTable">
                        <table>
                            <tr>
                                <td>Patient:</td>
                                <td><PatientHeader
                                    handlePatientClick={(id: string)=>this.handlePatientClick(id)}
                                    patient={patientViewPageStore.patientViewData.result.patient}
                                    studyId={patientViewPageStore.studyId}
                                    darwinUrl={patientViewPageStore.darwinUrl.result}
                                    sampleManager={sampleManager}/></td>
                            </tr>
                            <tr>
                                <td>Samples:</td>
                                <td>
                                    <div className="patientSamples">{sampleHeader}</div>
                                </td>
                            </tr>
                        </table>
                        </div>
                        <div className="studyMetaBar">{ studyName } <If condition={(cohortNav != null)}>{cohortNav}</If></div>
                    </div>
                )
                }
                </div>
                <If condition={patientViewPageStore.patientViewData.isComplete}>
                <Then>
                <MSKTabs id="patientViewPageTabs" activeTabId={this.props.routing.location.query.tab}  onTabClick={(id:string)=>this.handleTabChange(id)} className="mainTabs">

                        <MSKTab key={0} id="summaryTab" linkText="Summary">

                            <LoadingIndicator isLoading={patientViewPageStore.clinicalEvents.isPending} />

                            {
                                (!!sampleManager && patientViewPageStore.clinicalEvents.isComplete && patientViewPageStore.clinicalEvents.result.length > 0) && (

                                    <div style={{display: 'none'}}>
                                        <Timeline store={patientViewPageStore} getWidth={ ()=>$(window).width()-40 } sampleManager={ sampleManager } />
                                        <hr />
                                    </div>
                                )

                            }

                            <LoadingIndicator
                                    isLoading={patientViewPageStore.mutationData.isPending || patientViewPageStore.cnaSegments.isPending}
                            />

                            {
                                (patientViewPageStore.mutationData.isComplete && patientViewPageStore.cnaSegments.isComplete
                                && patientViewPageStore.sequencedSampleIdsInStudy.isComplete && sampleManager)
                                && ( patientViewPageStore.mutationData.result.length > 0 || patientViewPageStore.cnaSegments.result.length > 0)
                                && (
                                    <div>
                                        <GenomicOverview
                                            mergedMutations={patientViewPageStore.mergedMutationData}
                                            samples={patientViewPageStore.samples.result}
                                            cnaSegments={patientViewPageStore.cnaSegments.result}
                                            sampleOrder={sampleManager.sampleIndex}
                                            sampleLabels={sampleManager.sampleLabels}
                                            sampleColors={sampleManager.sampleColors}
                                            sampleManager={sampleManager}
                                            getContainerWidth={()=>$(window).width()}
                                        />
                                        <hr />
                                    </div>
                                )
                            }

                            <LoadingIndicator isLoading={patientViewPageStore.mutationData.isPending || patientViewPageStore.uncalledMutationData.isPending || patientViewPageStore.oncoKbAnnotatedGenes.isPending} />

                            {
                                (patientViewPageStore.oncoKbAnnotatedGenes.isComplete && patientViewPageStore.mutationData.isComplete && patientViewPageStore.uncalledMutationData.isComplete && !!sampleManager) && (
                                    <PatientViewMutationTable
                                        sampleManager={sampleManager}
                                        sampleIds={sampleManager ? sampleManager.getSampleIdsInOrder() : []}
                                        uniqueSampleKeyToTumorType={patientViewPageStore.uniqueSampleKeyToTumorType}
                                        molecularProfileIdToMolecularProfile={patientViewPageStore.molecularProfileIdToMolecularProfile.result}
                                        variantCountCache={patientViewPageStore.variantCountCache}
                                        indexedVariantAnnotations={patientViewPageStore.indexedVariantAnnotations}
                                        discreteCNACache={patientViewPageStore.discreteCNACache}
                                        mrnaExprRankCache={patientViewPageStore.mrnaExprRankCache}
                                        oncoKbEvidenceCache={patientViewPageStore.oncoKbEvidenceCache}
                                        pubMedCache={patientViewPageStore.pubMedCache}
                                        mrnaExprRankMolecularProfileId={patientViewPageStore.mrnaRankMolecularProfileId.result || undefined}
                                        discreteCNAMolecularProfileId={patientViewPageStore.molecularProfileIdDiscrete.result}
                                        data={patientViewPageStore.mergedMutationDataIncludingUncalled}
                                        downloadDataFetcher={patientViewPageStore.downloadDataFetcher}
                                        mutSigData={patientViewPageStore.mutSigData.result}
                                        myCancerGenomeData={patientViewPageStore.myCancerGenomeData}
                                        hotspotData={patientViewPageStore.indexedHotspotData}
                                        cosmicData={patientViewPageStore.cosmicData.result}
                                        oncoKbData={patientViewPageStore.oncoKbData}
                                        oncoKbAnnotatedGenes={patientViewPageStore.oncoKbAnnotatedGenes.result}
                                        civicGenes={patientViewPageStore.civicGenes}
                                        civicVariants={patientViewPageStore.civicVariants}
                                        userEmailAddress={AppConfig.userEmailAddress}
                                        enableOncoKb={AppConfig.showOncoKB}
                                        enableFunctionalImpact={AppConfig.showGenomeNexus}
                                        enableHotspot={AppConfig.showHotspot}
                                        enableMyCancerGenome={AppConfig.showMyCancerGenome}
                                        enableCivic={AppConfig.showCivic}
                                        columnVisibility={this.mutationTableColumnVisibility}
                                        columnVisibilityProps={{
                                            onColumnToggled: this.onMutationTableColumnVisibilityToggled
                                        }}
                                    />
                                )
                            }

                            <hr />

                            <LoadingIndicator isLoading={(this.cnaTableStatus === 'loading')} />

                            <CopyNumberTableWrapper
                                sampleIds={sampleManager ? sampleManager.getSampleIdsInOrder() : []}
                                sampleManager={sampleManager}
                                cnaOncoKbData={patientViewPageStore.cnaOncoKbData}
                                cnaCivicGenes={patientViewPageStore.cnaCivicGenes}
                                cnaCivicVariants={patientViewPageStore.cnaCivicVariants}
                                oncoKbEvidenceCache={patientViewPageStore.oncoKbEvidenceCache}
                                oncoKbAnnotatedGenes={patientViewPageStore.oncoKbAnnotatedGenes.result}
                                enableOncoKb={AppConfig.showOncoKB}
                                enableCivic={AppConfig.showCivic}
                                userEmailAddress={AppConfig.userEmailAddress}
                                pubMedCache={patientViewPageStore.pubMedCache}
                                data={patientViewPageStore.mergedDiscreteCNAData}
                                copyNumberCountCache={patientViewPageStore.copyNumberCountCache}
                                mrnaExprRankCache={patientViewPageStore.mrnaExprRankCache}
                                gisticData={patientViewPageStore.gisticData.result}
                                mrnaExprRankMolecularProfileId={patientViewPageStore.mrnaRankMolecularProfileId.result || undefined}
                                status={this.cnaTableStatus}
                                columnVisibility={this.cnaTableColumnVisibility}
                                columnVisibilityProps={{
                                    onColumnToggled: this.onCnaTableColumnVisibilityToggled
                                }}
                            />
                        </MSKTab>

                        {(patientViewPageStore.pageMode === 'patient') && (
                        <MSKTab key={2} id="clinicalDataTab" linkText="Clinical Data">

                                    <div className="clearfix">
                                        <FeatureTitle title="Patient"
                                                      isLoading={ patientViewPageStore.clinicalDataPatient.isPending }
                                                      className="pull-left"/>
                                        { (patientViewPageStore.clinicalDataPatient.isComplete) && (
                                            <ClinicalInformationPatientTable showTitleBar={true}
                                                                             data={patientViewPageStore.clinicalDataPatient.result}/>

                                        )
                                        }
                                    </div>

                            <br />

                            <div className="clearfix">
                                <FeatureTitle title="Samples" isLoading={ patientViewPageStore.clinicalDataGroupedBySample.isPending } className="pull-left" />
                                {  (patientViewPageStore.clinicalDataGroupedBySample.isComplete) && (
                                    <ClinicalInformationSamples
                                        samples={patientViewPageStore.clinicalDataGroupedBySample.result!}/>
                                )
                                }
                            </div>


                        </MSKTab>
                    )}


                    <MSKTab key={3} id="pathologyReportTab" linkText="Pathology Report"
                            hide={!this.shouldShowPathologyReport(patientViewPageStore)}
                            loading={patientViewPageStore.pathologyReport.isPending}
                    >
                        <div>
                            <PathologyReport iframeStyle={{position:"absolute", top:0}} pdfs={patientViewPageStore.pathologyReport.result} />
                        </div>
                    </MSKTab>


                    { /*
                     <MSKTab key={4} id="heatMapReportTab" linkText="Heatmap"
                             hide={(patientViewPageStore.MDAndersonHeatMapAvailable.isComplete && !patientViewPageStore.MDAndersonHeatMapAvailable.result)}
                            loading={patientViewPageStore.MDAndersonHeatMapAvailable.isPending}
                    >
                            <IFrameLoader height={700} url={ `//bioinformatics.mdanderson.org/TCGA/NGCHMPortal/?participant=${patientViewPageStore.patientId}` } />
                    </MSKTab>
                     */ }

                    <MSKTab key={5} id="tissueImageTab" linkText="Tissue Image"
                            hide={/https/.test(window.location.protocol) // can't show this iframe if we're on https:
                                    || (patientViewPageStore.hasTissueImageIFrameUrl.isComplete && !patientViewPageStore.hasTissueImageIFrameUrl.result)}
                            loading={patientViewPageStore.hasTissueImageIFrameUrl.isPending}
                    >
                        <div style={{position: "relative"}}>
                            <IFrameLoader height={700} url={  `http://cancer.digitalslidearchive.net/index_mskcc.php?slide_name=${patientViewPageStore.patientId}` } />
                        </div>
                    </MSKTab>

                    <MSKTab key={6} id="pathologySlides" linkText="Pathology Slides" label="PROTOTYPE">
                        <div style={{position: "relative"}}>
                            <iframe className="fullWidthExternal" src={patientViewPageStore.getPathologySlideURL.result}>
                            no iframe support
                            </iframe>
                        </div>
                    </MSKTab>

                    <MSKTab key={7} id="fmiReportSlides" linkText="FMI Report" label="PROTOTYPE">
                        {
                            patientViewPageStore.getSampleFMIReports.result.map(sample =>
                                <div style={{position: "relative"}}>
                                    <h3>Sample {sample.sampleId}</h3>
                                    <object className="fullWidthExternal" data={sample.fmiReport} type="application/pdf">
                                        <iframe className="fullWidthExternal" src={sample.fmiReport}>
                                            no iframe support
                                        </iframe>
                                    </object>
                                </div>
                            )
                        }
                    </MSKTab>

                    <MSKTab key={8} id="timelineDataTab1" linkText="Lab tests (Fast drug screening)" label="PROTOTYPE">

                        <div className="clearfix">
                            <FeatureTitle title="Lab tests (Fast drug screening)"
                                          isLoading={ patientViewPageStore.clinicalEvents.isPending }
                                          className="pull-left"/>
                            <div className="pull-left" style={{marginLeft: '10px'}}>
                                <label>
                                    <input type="checkbox"
                                        onChange={(e) => { this.setState((pstate) => ({ heatmap: !pstate.heatmap }))}}
                                        checked={this.state.heatmap} style={{marginRight: '5px'}}
                                    />
                                    Use Heatmap
                                </label>
                            </div>

                            { (patientViewPageStore.clinicalEvents.isComplete) && (
                                <If condition={this.state.heatmap}>
                                    <Then>
                                        <ClinicalInformationEventsTable
                                            showTitleBar={true} heatmap={true}
                                            data={patientViewPageStore.clinicalEvents.result}
                                        />
                                    </Then>
                                    <Else>
                                        <div style={{clear: 'both', display: 'flex', justifyContent: 'center'}}>
                                            <FastDrugsBarPlot
                                                showTitleBar={true}
                                                data={patientViewPageStore.clinicalEvents.result}
                                            />
                                        </div>
                                    </Else>
                                </If>
                            )
                            }
                        </div>
                   </MSKTab>
              </MSKTabs>


                    </Then>
                    <Else>
                        <ThreeBounce size={20} className="center-block text-center" />
                    </Else>

                </If>

            </div>
        );
    }
}

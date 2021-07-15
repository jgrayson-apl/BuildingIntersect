/*
  Copyright 2017 Esri

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.​
*/

define([
  "calcite",
  "dojo/_base/declare",
  "ApplicationBase/ApplicationBase",
  "dojo/i18n!./nls/resources",
  "ApplicationBase/support/itemUtils",
  "ApplicationBase/support/domHelper",
  "dojo/_base/Color",
  "dojo/colors",
  "dojo/number",
  "dojo/date/locale",
  "dojo/keys",
  "dojo/on",
  "dojo/touch",
  "dojo/query",
  "dojo/dom",
  "dojo/dom-class",
  "dojo/dom-construct",
  "esri/identity/IdentityManager",
  "esri/core/Evented",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/portal/Portal",
  "esri/layers/Layer",
  "esri/layers/GraphicsLayer",
  "esri/geometry/Multipoint",
  "esri/geometry/Extent",
  "esri/geometry/Polyline",
  "esri/geometry/Polygon",
  "esri/geometry/Circle",
  "esri/geometry/geometryEngine",
  "esri/Graphic",
  "esri/tasks/Locator",
  "esri/widgets/Home",
  "esri/widgets/Search",
  "esri/widgets/BasemapGallery",
  "esri/widgets/Expand",
  "esri/tasks/RouteTask",
  "esri/tasks/support/RouteParameters",
  "esri/tasks/support/FeatureSet",
  "Application/POIAdapter"
], function(calcite, declare, ApplicationBase, i18n, itemUtils, domHelper,
            Color, colors, number, locale, keys, on, touch, query, dom, domClass, domConstruct,
            IdentityManager, Evented, watchUtils, promiseUtils, Portal, Layer, GraphicsLayer,
            Multipoint, Extent, Polyline, Polygon, Circle, geometryEngine,
            Graphic, Locator, Home, Search, BasemapGallery, Expand,
            RouteTask, RouteParameters, FeatureSet, POIAdapter){

  return declare([Evented], {

    /**
     *
     */
    constructor: function(){
      this.CSS = {
        loading: "configurable-application--loading"
      };
      this.base = null;

      // CALCITE WEB //
      calcite.init();
    },

    /**
     *
     * @param base
     */
    init: function(base){
      if(!base){
        console.error("ApplicationBase is not defined");
        return;
      }
      domHelper.setPageLocale(base.locale);
      domHelper.setPageDirection(base.direction);

      this.base = base;
      const config = base.config;
      const results = base.results;
      const find = config.find;
      const marker = config.marker;

      const allMapAndSceneItems = results.webMapItems.concat(results.webSceneItems);
      const validMapItems = allMapAndSceneItems.map(function(response){
        return response.value;
      });

      const firstItem = validMapItems[0];
      if(!firstItem){
        console.error("Could not load an item to display");
        return;
      }
      config.title = (config.title || itemUtils.getItemTitle(firstItem));
      domHelper.setPageTitle(config.title);

      const viewProperties = itemUtils.getConfigViewProperties(config);
      viewProperties.container = "view-container";
      viewProperties.constraints = { snapToZoom: false };

      const portalItem = this.base.results.applicationItem.value;
      const appProxies = (portalItem && portalItem.appProxies) ? portalItem.appProxies : null;

      itemUtils.createMapFromItem({ item: firstItem, appProxies: appProxies }).then((map) => {
        viewProperties.map = map;
        itemUtils.createView(viewProperties).then((view) => {
          view.when(() => {
            domClass.remove(document.body, this.CSS.loading);
            this.viewReady(config, firstItem, view);
          });
        });
      });
    },

    /**
     *
     * @param config
     * @param item
     * @param view
     */
    viewReady: function(config, item, view){

      // TITLE //
      dom.byId("app-title-node").innerHTML = config.title;

      // LOADING //
      const updating_node = domConstruct.create("div", { className: "view-loading-node loader" });
      domConstruct.create("div", { className: "loader-bars" }, updating_node);
      domConstruct.create("div", { className: "loader-text font-size--3 text-white", innerHTML: "Updating..." }, updating_node);
      view.ui.add(updating_node, "bottom-right");
      watchUtils.init(view, "updating", (updating) => {
        domClass.toggle(updating_node, "is-active", updating);
      });

      // USER SIGN IN //
      this.initializeUserSignIn(view).always(() => {

        // POPUP DOCKING OPTIONS //
        view.popup.dockEnabled = true;
        view.popup.dockOptions = {
          buttonEnabled: false,
          breakpoint: false,
          position: "top-center"
        };

        // SEARCH //
        const search = new Search({
          view: view,
          resultGraphicEnabled: false,
          popupEnabled: false
        });
        const searchExpand = new Expand({
          view: view,
          content: search,
          expandIconClass: "esri-icon-search",
          expandTooltip: "Search"
        });
        view.ui.add(searchExpand, { position: "top-left", index: 0 });

        // BASEMAPS //
        const basemapGalleryExpand = new Expand({
          view: view,
          content: new BasemapGallery({ view: view }),
          expandIconClass: "esri-icon-basemap",
          expandTooltip: "Basemap"
        });
        view.ui.add(basemapGalleryExpand, { position: "top-left", index: 1 });

        // HOME //
        const home = new Home({ view: view });
        view.ui.add(home, { position: "top-left", index: 2 });

        // POINTS OF INTEREST //
        this.initializePOISearch(view);

        // BUILDING INTERSECTIONS //
        this.initializeBuildingIntersections(view);

        // ZIP CODE SEARCH //
        this.initializeZipCodeSearch(search);

      });

    },

    /**
     *
     * @param search
     */
    initializeZipCodeSearch: function(search){

      // ZIP CODE INPUT //
      const user_zip_btn = dom.byId("zip-code-dialog-ok");
      const user_zip_input = dom.byId("user-zip-input");
      on(user_zip_input, "input", () => {
        domClass.toggle(user_zip_btn, "btn-disabled", !user_zip_input.validity.valid);
      });
      on(user_zip_input, "keypress", (evt) => {
        if((evt.charCode === keys.ENTER) && user_zip_input.validity.valid){
          user_zip_btn.click();
        }
      });
      on(user_zip_btn, "click", () => {
        const user_zip = dom.byId("user-zip-input").value;
        search.search(user_zip);
      });
      // DISPLAY ZIP CODE DIALOG //
      calcite.bus.emit("modal:open", { id: "zip-code-dialog" });
      user_zip_input.focus();

    },

    /**
     *
     * @returns {*}
     */
    initializeUserSignIn: function(view){

      const checkSignInStatus = () => {
        return IdentityManager.checkSignInStatus(this.base.portal.url).then(userSignIn);
      };
      IdentityManager.on("credential-create", checkSignInStatus);
      IdentityManager.on("credential-destroy", checkSignInStatus);

      // SIGN IN NODE //
      const signInNode = dom.byId("sign-in-node");
      const userNode = dom.byId("user-node");

      // UPDATE UI //
      const updateSignInUI = () => {
        if(this.base.portal.user){
          dom.byId("user-firstname-node").innerHTML = this.base.portal.user.fullName.split(" ")[0];
          dom.byId("user-fullname-node").innerHTML = this.base.portal.user.fullName;
          dom.byId("username-node").innerHTML = this.base.portal.user.username;
          dom.byId("user-thumb-node").src = this.base.portal.user.thumbnailUrl;
          domClass.add(signInNode, "hide");
          domClass.remove(userNode, "hide");
        } else {
          domClass.remove(signInNode, "hide");
          domClass.add(userNode, "hide");
        }
        return promiseUtils.resolve();
      };

      // SIGN IN //
      const userSignIn = () => {
        this.base.portal = new Portal({ url: this.base.config.portalUrl, authMode: "immediate" });
        return this.base.portal.load().then(() => {
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).otherwise(console.warn);
      };

      // SIGN OUT //
      const userSignOut = () => {
        IdentityManager.destroyCredentials();
        this.base.portal = new Portal({});
        this.base.portal.load().then(() => {
          this.base.portal.user = null;
          this.emit("portal-user-change", {});
          return updateSignInUI();
        }).otherwise(console.warn);

      };

      // USER SIGN IN //
      on(signInNode, touch.press, userSignIn);

      // SIGN OUT NODE //
      const signOutNode = dom.byId("sign-out-node");
      if(signOutNode){
        on(signOutNode, touch.press, userSignOut);
      }

      return checkSignInStatus();
    },

    /**
     *
     * @param view
     * @param layer_title
     * @param ready_callback
     * @returns {*}
     */
    whenLayerReady: function(view, layer_title, ready_callback){

      const layer = view.map.layers.find(layer => {
        return (layer.title === layer_title);
      });
      if(layer){
        return layer.load().then(() => {
          if(layer.visible){
            return view.whenLayerView(layer).then((layerView) => {

              if(ready_callback){
                ready_callback({ layer: layer, layerView: layerView });
              }

              if(layerView.updating){
                return watchUtils.whenNotOnce(layerView, "updating").then(() => {
                  return { layer: layer, layerView: layerView };
                });
              } else {
                return watchUtils.whenOnce(layerView, "updating").then(() => {
                  return watchUtils.whenNotOnce(layerView, "updating").then(() => {
                    return { layer: layer, layerView: layerView };
                  });
                });
              }
            });
          } else {
            return promiseUtils.resolve({ layer: layer, layerView: null });
          }
        });
      } else {
        return promiseUtils.reject(new Error(`Can't find layer '${layer_title}'`));
      }

    },

    /**
     *
     * @param view
     */
    initializePOISearch: function(view){

      const pot_count_extent_label = dom.byId("poi-count-extent-label");
      const pot_count_aoi_label = dom.byId("poi-count-aoi-label");
      const pot_count_visible_label = dom.byId("poi-count-visible-label");


      const poiFeatureLayerAdapter = new POIAdapter();
      watchUtils.whenDefinedOnce(poiFeatureLayerAdapter, "layer", () => {

        const poiFeatureLayer = poiFeatureLayerAdapter.layer;
        view.map.add(poiFeatureLayer);

        view.whenLayerView(poiFeatureLayer).then(poiFeatureLayerView => {

          const getPOICount = (searchGeometry) => {
            return poiFeatureLayer.queryFeatureCount({ geometry: searchGeometry }).then(featureCount => {
              return featureCount;
            });
          };

          const selected_effect = "brightness(10.0) opacity(0.2)";
          this.on("analysis-update", evt => {

            if(evt.aoi){
              getPOICount(evt.aoi).then(aoiCount => {
                pot_count_aoi_label.innerHTML = number.format(aoiCount);
              });
            } else {
              pot_count_aoi_label.innerHTML = "0";
            }

            if(evt.visibility){
              getPOICount(evt.visibility).then(visibilityCount => {
                pot_count_visible_label.innerHTML = number.format(visibilityCount);
              });
              poiFeatureLayerView.effect = {
                filter: { geometry: evt.visibility },
                includedEffect: selected_effect
              };
            } else {
              pot_count_visible_label.innerHTML = "0";
              poiFeatureLayerView.effect = {
                filter: { where: "1 <> 1" },
                excludeEffect: selected_effect
              };
            }

          });

          watchUtils.whenTrue(view, "stationary", () => {
            watchUtils.whenNotOnce(view, "updating").then(() => {
              getPOICount(view.extent).then(extentCount => {
                pot_count_extent_label.innerHTML = number.format(extentCount);
              });
            });
          });

        });
      });

    },

    /**
     *
     * @param view
     */
    initializeBuildingIntersections: function(view){


      const buildings_count_label = dom.byId("buildings-count-label");
      const footprints_count_label = dom.byId("footprints-count-label");
      const visibility_count_label = dom.byId("visibility-count-label");

      const clearAnalysisCounts = () => {
        footprints_count_label.innerHTML = "0";
        visibility_count_label.innerHTML = "0";
      };


      const stopSymbol = {
        type: "simple-marker",
        style: "circle",
        color: Color.named.orange.concat(0.5),
        size: 13,
        outline: {
          color: Color.named.white, //"#0079c1",
          width: 1.5
        }
      };
      const routeSymbol = {
        type: "simple-line",
        color: Color.named.orange, //"#0079c1",
        width: 3.5,
        style: "solid"
      };
      const routeLayer = new GraphicsLayer({ title: "Route" });

      const location_graphic = new Graphic({
        symbol: {
          type: "simple-marker",
          style: "cross",
          color: Color.named.white,
          size: 16,
          outline: {
            color: Color.named.white.concat(0.8),
            width: 5.0
          }
        }
      });
      const footprints_graphic = new Graphic({
        geometry: null,
        symbol: {
          type: "simple-fill",
          color: Color.named.transparent,
          style: "solid",
          outline: {
            color: "#0079c1",
            width: 0.8,
            style: "solid"
          }
        }
      });
      const search_graphic = new Graphic({
        geometry: null,
        symbol: {
          type: "simple-fill",
          color: Color.named.transparent,
          style: "solid",
          outline: {
            color: Color.named.white,
            width: 1.0,
            style: "long-dash"
          }
        }
      });
      const sightline_graphic = new Graphic({
        geometry: null,
        symbol: {
          type: "simple-line",
          color: Color.named.red.concat(0.8),
          width: 0.8,
          style: "solid"
        }
      });
      const intersections_graphic = new Graphic({
        geometry: null,
        symbol: {
          type: "simple-fill",
          color: Color.named.transparent,
          style: "solid",
          outline: {
            color: Color.named.yellow,
            width: 1.8,
            style: "solid"
          }
        }
        /*symbol: {
          type: "simple-marker",
          color: Color.named.red.concat(0.5),
          style: "circle",
          size: 7,
          outline: {
            color: Color.named.white,
            width: 0.5
          }
        }*/
      });
      const visibility_graphic = new Graphic({
        geometry: null,
        symbol: {
          type: "simple-fill",
          color: Color.named.lime.concat(0.2),
          style: "solid",
          outline: {
            color: Color.named.lime,
            width: 1.8,
            style: "solid"
          }
        }
      });
      const history_graphic = new Graphic({
        geometry: null,
        symbol: {
          type: "simple-fill",
          color: Color.named.white.concat(0.3),
          style: "solid",
          outline: {
            color: Color.named.white,
            width: 1.5,
            style: "solid"
          }
        }
      });

      const analysis_layer = new GraphicsLayer({
        title: "Intersecting Buildings Analysis Results",
        graphics: [history_graphic, search_graphic, footprints_graphic, sightline_graphic, visibility_graphic, intersections_graphic, location_graphic]
      });
      view.map.addMany([routeLayer, analysis_layer]);

      const clearAnalysis = () => {
        clearAnalysisCounts();
        location_graphic.geometry = null;
        search_graphic.geometry = null;
        footprints_graphic.geometry = null;
        sightline_graphic.geometry = null;
        intersections_graphic.geometry = null;
        visibility_graphic.geometry = null;
        history_graphic.geometry = null;
        this.emit("analysis-update", { aoi: null, visibility: null });
      };

      //const history = new Collection();


      this.whenLayerReady(view, "Microsoft Building Footprints", (layer_infos) => {
        layer_infos.layer.outFields = ["*"];
      }).then(layer_info => {
        const footprints_layer = layer_info.layer;
        const footprints_layerView = layer_info.layerView;

        const selected_effect = "brightness(1.8) opacity(0.6)";

        this.on("analysis-update", evt => {
          if(evt.visibility){
            footprints_layerView.effect = {
              filter: { geometry: evt.visibility },
              includedEffect: selected_effect
            };
          } else {
            footprints_layerView.effect = {
              filter: { where: "1 <> 1" },
              excludeEffect: selected_effect
            };
          }
        });

        const clear_btn = dom.byId("clear-btn");
        on(clear_btn, touch.press, () => {
          clearAnalysis();
          resetRouteActions();
          clearActions();
        });

        const not_null = item => item != null;

        const getBuildings = (extent) => {
          return footprints_layerView.queryFeatures({ geometry: extent, returnGeometry: true }).then(featureSet => {
            return featureSet.features;
          });
        };

        let building_footprints = [];
        let get_buildings_handle = null;
        const getFootprints = (extent) => {
          get_buildings_handle && (!get_buildings_handle.isFulfilled()) && get_buildings_handle.cancel();
          get_buildings_handle = getBuildings(extent).then(building_features => {

            buildings_count_label.innerHTML = number.format(building_features.length);

            building_footprints = building_features.map(building_feature => {
              //return building_feature.geometry;
              return geometryEngine.simplify(building_feature.geometry);
            });

          });
        };

        const getFootprintIntersections = (geometry) => {
          return geometryEngine.intersect(building_footprints, geometry).filter(not_null);
        };

        watchUtils.whenTrue(view, "stationary", () => {
          watchUtils.whenNotOnce(view, "updating").then(() => {
            getFootprints(view.extent);
          });
        });

        const distance_input = dom.byId("search-distance-input");
        const distance_label = dom.byId("search-distance-label");
        on(distance_input, "input", () => {
          distance_label.innerHTML = distance_input.valueAsNumber;
          createAnalysis();
        });

        const ANALYSIS_RESOLUTION = {
          COARSE: 89,
          FINE: 179,
          BEST: 359
        };

        const createSearchArea = (location, numberOfPoints) => {
          return new Circle({
            geodesic: true,
            center: location,
            numberOfPoints: numberOfPoints || ANALYSIS_RESOLUTION.BEST,
            radius: distance_input.valueAsNumber,
            radiusUnit: "meters"
          });
        };

        const createSightline = (circle) => {
          const center = [circle.center.x, circle.center.y];
          const parts = circle.rings[0].map(coords => {
            return [center, coords]
          });
          return new Polyline({
            hasZ: false, hasM: false,
            spatialReference: circle.spatialReference,
            paths: parts
          });
        };

        const createSightlines = (circle) => {
          const center = [circle.center.x, circle.center.y];
          return circle.rings[0].map(coords => {
            return new Polyline({
              type: "polyline",
              hasZ: false, hasM: false,
              spatialReference: circle.spatialReference,
              paths: [center, coords]
            });
          });
        };


        let analysis_location = view.extent.center.clone();
        const createAnalysis = (location, numberOfPoints) => {

          // ANALYSIS LOCAITON //
          analysis_location = location || analysis_location;

          // LOCATION //
          location_graphic.geometry = analysis_location;

          // SEARCH //
          search_graphic.geometry = createSearchArea(analysis_location, numberOfPoints);

          // BUILDING INTERSECTIONS //
          const footprint_intersections = getFootprintIntersections(search_graphic.geometry);
          footprints_count_label.innerHTML = number.format(footprint_intersections.length);

          // IS ANALYSIS LOCATION OVER A BUILDING //
          const location_intersections = getFootprintIntersections(analysis_location);
          if(location_intersections.length > 0){
            //clearAnalysis();

            visibility_graphic.geometry = null;
            visibility_count_label.innerHTML = "0";

            this.emit("analysis-update", { aoi: search_graphic.geometry, visibility: null });

          } else {

            // FOOTPRINTS //
            const footprints = geometryEngine.union(footprint_intersections);
            //console.assert(footprints != null, footprint_intersections);
            //footprints_graphic.geometry = footprints;

            // SIGHTLINES //
            const sightlines = createSightlines(search_graphic.geometry);
            //sightline_graphic.geometry = geometryEngine.union(sightlines);
            //sightline_graphic.geometry = geometryEngine.intersect(footprints, geometryEngine.union(sightlines));

            // INTERSECTIONS //
            const intersection_locations = sightlines.map(sightline => {
              const sightline_intersection = geometryEngine.intersect(footprints, sightline);
              if(sightline_intersection){
                return sightline_intersection.paths[0][0];
              } else {
                return sightline.paths[0][1];
              }
            });

            // VISIBILITY //
            const intersection_visibility = visibility_graphic.geometry = new Polygon({
              spatialReference: view.spatialReference,
              rings: [intersection_locations]
            });
            // CLIP VISIBILITY TO FOOTPRINTS //
            const visibility = geometryEngine.difference(intersection_visibility, footprints);

            // INTERSECTING BUILDINGS //
            const visible_intersections = getFootprintIntersections(intersection_visibility);
            //intersections_graphic.geometry = geometryEngine.union(visible_intersections);
            visibility_count_label.innerHTML = number.format(visible_intersections.length);

            this.emit("analysis-update", { aoi: search_graphic.geometry, visibility: visibility });
            //return visibility;
          }
        };

        let polyline = null;
        let coordIdx = 0;
        let coordCount = -Infinity;
        const loop = true;

        const fps = 15;
        let animating = false;
        const updateAnalysisAlongPath = (ts) => {

          coordIdx++;
          if(coordIdx < coordCount){
            const location = polyline.getPoint(0, coordIdx);

            createAnalysis(location, (coordIdx === (coordCount - 1) ? ANALYSIS_RESOLUTION.BEST : ANALYSIS_RESOLUTION.FINE));

            if(animating){
              requestAnimationFrame(updateAnalysisAlongPath);
            }
          } else {
            coordIdx = 0;
            if(loop){
              requestAnimationFrame(updateAnalysisAlongPath);
            } else {
              domClass.toggle(play_btn, "icon-ui-play icon-ui-pause");
              animating = false;
            }
          }
        };


        // ALONG A PATH //
        const analysisAlongPath = (path) => {
          polyline = geometryEngine.densify(path, 5, "meters");
          coordCount = polyline.paths[0].length;

          domClass.remove(play_btn, "btn-disabled");
          domClass.toggle(play_btn, "icon-ui-play icon-ui-pause");

          animating = true;
          requestAnimationFrame(updateAnalysisAlongPath);
        };

        // ROUTE TASK //
        const route_task = new RouteTask({ url: "https://route.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World" });
        const route_params = new RouteParameters({
          outSpatialReference: view.spatialReference,
          returnStops: true,
          preserveFirstStop: true,
          preserveLastStop: true,
          // outputGeometryPrecision: 0.0,
          outputLines: "true-shape-with-measure",
          stops: new FeatureSet({ features: [] })
        });

        // LOCATION CLICK //
        const location_click_handle = on.pausable(view, "pointer-down", pointer_evt => {
          pointer_evt.stopPropagation();
          if(building_footprints.length){
            createAnalysis(view.toMap(pointer_evt), ANALYSIS_RESOLUTION.COARSE);
            drag_handle.resume();
            on.once(view, "pointer-up", pointer_evt => {
              view.container.style.cursor = "crosshair";
              drag_handle.pause();
              createAnalysis(view.toMap(pointer_evt), ANALYSIS_RESOLUTION.BEST);
            });
          }
        });
        location_click_handle.pause();

        // LOCATION DRAG //
        const drag_handle = on.pausable(view, "drag", drag_evt => {
          drag_evt.stopPropagation();
          if(building_footprints.length){
            view.container.style.cursor = "move";
            createAnalysis(view.toMap(drag_evt), ANALYSIS_RESOLUTION.COARSE);
          }
        });
        drag_handle.pause();

        // ROUTE CLICK //
        const route_click_handle = on.pausable(view, "click", click_evt => {
          if(building_footprints.length){

            const stop = new Graphic({
              geometry: click_evt.mapPoint,
              symbol: stopSymbol
            });
            routeLayer.add(stop);
            route_params.stops.features.push(stop);

            switch(route_params.stops.features.length){
              case 1:
                break;
              case 2:
                route_task.solve(route_params).then(response => {

                  // ROUTE RESULT //
                  const routeResult = response.routeResults[0];

                  // ROUTE //
                  const route = routeResult.route.clone();
                  route.symbol = routeSymbol;
                  routeLayer.removeAll();
                  routeLayer.add(route);

                  // STOPS //
                  routeLayer.addMany(routeResult.stops.map(stop => {
                    return { geometry: stop.geometry, symbol: stopSymbol };
                  }));

                  analysisAlongPath(route.geometry);
                  clearActions();

                });
                break;
              default:
                routeLayer.removeAll();
                route_params.stops.features = [];
            }
          }
        });
        route_click_handle.pause();


        // LOCATION BUTTON //
        const location_btn = dom.byId("location-btn");
        on(location_btn, touch.press, () => {
          clearAnalysis();
          domClass.toggle(location_btn, "btn-clear");
          if(domClass.contains(location_btn, "btn-clear")){
            domClass.remove(path_btn, "btn-clear");
            resetRouteActions();
            view.container.style.cursor = "crosshair";
            route_click_handle.pause();
            location_click_handle.resume();
          } else {
            clearActions();
          }
        });

        // PATH BUTTON //
        const path_btn = dom.byId("path-btn");
        on(path_btn, touch.press, () => {
          clearAnalysis();
          domClass.toggle(path_btn, "btn-clear");
          if(domClass.contains(path_btn, "btn-clear")){
            domClass.remove(location_btn, "btn-clear");
            resetRouteActions();
            view.container.style.cursor = "crosshair";
            location_click_handle.pause();
            route_click_handle.resume();
          } else {
            clearActions();
          }
        });
        this.on("portal-user-change", () => {
          domClass.toggle(path_btn, "btn-disabled", (this.base.portal.user == null));
        });
        domClass.toggle(path_btn, "btn-disabled", (this.base.portal.user == null));

        // PLAY/PAUSE BUTTON //
        const play_btn = dom.byId("play-btn");
        on(play_btn, touch.press, () => {
          domClass.toggle(play_btn, "icon-ui-play icon-ui-pause");
          animating = domClass.contains(play_btn, "icon-ui-pause");
          if(animating){
            requestAnimationFrame(updateAnalysisAlongPath);
          }
        });

        const resetRouteActions = () => {
          routeLayer.removeAll();
          route_params.stops.features = [];
          coordIdx = 0;
          domClass.add(play_btn, "btn-disabled");
        };

        const clearActions = () => {
          domClass.remove(location_btn, "btn-clear");
          domClass.remove(path_btn, "btn-clear");
          location_click_handle.pause();
          route_click_handle.pause();
          view.container.style.cursor = "default";
        };

      });
    }

  });
});


/*
initializeSchoolsLayer: function(view){

      const facility_count_extent_label = dom.byId("facility-count-extent-label");
      const facility_count_aoi_label = dom.byId("facility-count-aoi-label");
      const facility_count_visible_label = dom.byId("facility-count-visible-label");

      const facilitiesLayer = view.map.layers.find(layer => {
        return (layer.title === "2019 USA Traffic Counts");
      });
      facilitiesLayer.load().then(() => {
        view.whenLayerView(facilitiesLayer).then(facilitiesLayerView => {

          const selected_effect = "brightness(5.0) opacity(0.25)";

          const getFacilityCount = (searchGeometry) => {
            return facilitiesLayerView.queryFeatureCount({ geometry: searchGeometry }).then(featureCount => {
              return featureCount;
            });
          };

          this.on("analysis-update", evt => {

            if(evt.aoi){
              getFacilityCount(evt.aoi).then(aoiCount => {
                facility_count_aoi_label.innerHTML = number.format(aoiCount);
              });
            } else {
              facility_count_aoi_label.innerHTML = "0";
            }

            if(evt.visibility){
              getFacilityCount(evt.visibility).then(visibilityCount => {
                facility_count_visible_label.innerHTML = number.format(visibilityCount);
              });
              facilitiesLayerView.effect = {
                filter: { geometry: evt.visibility },
                includedEffect: selected_effect
              };
            } else {
              facility_count_visible_label.innerHTML = "0";
              facilitiesLayerView.effect = {
                filter: { where: "1 <> 1" },
                excludeEffect: selected_effect
              };
            }
          });

          watchUtils.whenTrue(view, "stationary", () => {
            watchUtils.whenNotOnce(view, "updating").then(() => {
              facilitiesLayerView.queryFeatures({ geometry: view.extent }).then(facilitiesFS => {
                facility_count_extent_label.innerHTML = number.format(facilitiesFS.features.length);
              });
            });
          });

        });
      });

    },*/

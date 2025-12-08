import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Kanva from "./pages/kanva/index";
import Pixi from "./pages/pixi/index";
import Fabric from "./pages/fabric/index";

import "./app.css";

const Routes = [
  {
    path: "/",
    Component: Kanva,
  },
  {
    path: "/pixi",
    element: <Pixi />,
  },
  {
    path: "/fabric",
    element: <Fabric />,
  },
];

const App = () => {
  return <RouterProvider router={createBrowserRouter(Routes)} />;
};

export default App;

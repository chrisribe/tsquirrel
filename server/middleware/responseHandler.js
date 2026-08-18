'use strict';

// Central response policy for server-rendered pages and HTMX fragments.
module.exports = (req, res, next) => {
  req.isHtmx = req.get('HX-Request') === 'true'
    && req.get('HX-History-Restore-Request') !== 'true';

  const varyForHtmx = () => {
    res.vary('HX-Request');
    res.vary('HX-History-Restore-Request');
  };

  // GET/page response: fragment for HTMX, layout-wrapped page otherwise.
  res.renderPage = (template, pageData, {
    pageTitle,
    pageDescription,
    noIndex = true,
    status = 200,
  } = {}) => {
    varyForHtmx();
    if (req.isHtmx) {
      return res.status(status).render(template, { pageData });
    }
    return res.status(status).render('layout-main', {
      template,
      pageData,
      pageTitle,
      pageDescription,
      noIndex,
    });
  };

  // Mutation response: exact component for HTMX, PRG fallback otherwise.
  res.renderFragmentOrRedirect = (template, pageData, redirectUrl, {
    status = 200,
    replaceUrl = null,
  } = {}) => {
    varyForHtmx();
    if (req.isHtmx) {
      if (replaceUrl) res.set('HX-Replace-Url', replaceUrl);
      return res.status(status).render(template, { pageData });
    }
    return res.redirect(303, redirectUrl);
  };

  // Use only when the successful mutation genuinely navigates elsewhere.
  res.redirectForRequest = (url) => {
    if (req.isHtmx) {
      res.set('HX-Redirect', url);
      return res.status(200).send('');
    }
    return res.redirect(303, url);
  };

  next();
};

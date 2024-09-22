(function() {
  document.addEventListener('DOMContentLoaded', function() {

    // Demo Event listener for htmx response errors
    document.body.addEventListener('htmx:responseError', function(event) {
      if (event.detail.xhr.status > 399) {
				if (document.getElementById('message')){
        	document.getElementById('message').innerHTML = event.detail.xhr.responseText;
				}
				else {
					alert(event.detail.xhr.responseText);
				}
      }
    });

    // Event listener for htmx after request
    document.body.addEventListener('htmx:afterRequest', function(event) {
      // Check if the form has the data-redirect-on-success attribute and redirect if successful
      redirectOnSuccess(event);
    });

    function redirectOnSuccess(event) {
      if (event.detail.successful && event.detail.elt.matches('form[data-redirect-on-success]')) {
        window.location.href = event.detail.elt.getAttribute('data-redirect-on-success');
      }
    }

  });
})();
# Error Page
Error page is a simple overlay page that can be used to display error messages to the user.

Show error with auto-hide after 5 seconds
`showError({ code: 'ERROR', msg: 'Something went wrong' });`
 
Show persistent error
`showError({ code: 'FATAL', msg: 'Fatal error occurred' }, 0);`